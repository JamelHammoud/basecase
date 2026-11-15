import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { runArena } from './arena';
import { currentDesign, skillFreshness, skillHash, type ArenaEvidence, type Freshness, type Skill } from './artifacts';
import type { Environment } from './environment';
import { checkFeasibility, type LadderChange } from './feasibility';
import { runCounted, runFolder, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { kitEnvironment, LEGGED_ENTRIES, trainedEntry, type KitEntry, type TrainedEntry } from './kitEnvironment';
import { arenaPasses, slowerSpeedEvidence } from './kitAcceptance';
import { kitJob, type KitStart } from './kitJob';
import { kitRobot, rootHeight } from './kitModel';
import { kitSchedule, type KitStage } from './kitSchedule';
import { firstPassingTry, type Judgement } from './kitTries';
import { validationReport, type ValidationReport } from './kitValidation';
import { transitionEvidence, type KitContext, type KitSkill, type KitTransitionEvidence } from './kitTransitions';
import { worstEvidence } from './skillRecords';
import { collapsedStart } from './kitStart';
import { proveSkill } from './prove';
import { loadKitLibrary } from '../routines/kitLibrary';

export type { ForgeJob, ForgeOutcome, ForgeRunner, SkillSave } from './forgeRunner';
export type { KitEntry } from './kitEnvironment';
export { kitEnvironment } from './kitEnvironment';

export interface KitCost {
  wallS: number;
  steps: number;
  forgeRuns: number;
  validationS?: number;
  validationRuns?: number;
}

export type KitOutcome =
  | { kind: 'skill'; skill: KitSkill; environment: Environment; cost: KitCost }
  | {
      kind: 'refused';
      reason: string;
      relaxation: { change: LadderChange; message: string } | null;
      cost: KitCost;
      evidence?: ArenaEvidence | null;
      validation?: KitTransitionEvidence;
    };

export interface KitWarm {
  from: string;
  policy: PolicySpec;
}

export interface KitInput extends KitContext {
  mj: MainModule;
  design: string;
  model: SimModel;
  entry: KitEntry;
  forge: ForgeRunner;
  save: SkillSave;
  signal?: AbortSignal;
  seed?: number;
  reverse?: boolean;
  warm?: KitWarm;
}

const SEED_SPAN = 1_000_000;

const freshSeed = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % SEED_SPAN);

const SKILL_NAMES: Record<KitEntry, string> = {
  stand: 'Stand',
  'get-up': 'Get up',
  'velocity-tracking': 'Velocity tracking',
  'pose-tracking': 'Pose tracking',
  'settle-to-neutral': 'Settle to neutral',
};

export const kitSkillName = (entry: KitEntry) => SKILL_NAMES[entry];

export function kitEntries(model: SimModel): TrainedEntry[] {
  const robot = model.robots[0];

  return robot?.floating && robot.morphology === 'legged' ? [...LEGGED_ENTRIES] : [];
}

class Clock {
  private started = performance.now();
  readonly tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  validationS = 0;
  validationRuns = 0;

  cost(): KitCost {
    return {
      wallS: (performance.now() - this.started) / 1000,
      ...this.tally,
      validationS: this.validationS,
      validationRuns: this.validationRuns,
    };
  }
}

function refusalFor(mj: MainModule, model: SimModel) {
  const report = checkFeasibility(mj, model, { robot: kitRobot(model).key, stand: true });

  return report.feasible ? null : { reason: report.summary, relaxation: report.relaxation };
}

interface Attempt {
  input: KitInput;
  entry: TrainedEntry;
  environment: Environment;
  start: KitStart | null;
  clock: Clock;
  best: { evidence: ArenaEvidence | null; score: number };
  reports: WeakMap<PolicySpec, ValidationReport>;
  validation: KitTransitionEvidence | null;
}

async function validate(run: Attempt, policy: PolicySpec): Promise<ValidationReport> {
  const known = run.reports.get(policy);

  if (known) return known;

  const report = await validationReport({ ...run.input, entry: run.entry, environment: run.environment, policy });

  run.reports.set(policy, report);
  run.clock.validationS += report.wallS;
  run.clock.validationRuns += 1;

  return report;
}

function failedStart(run: Attempt, report: ValidationReport) {
  const sample = report.transitions.starts.samples[0];

  if (!sample) return;

  const ids = report.transitions.starts.joints;

  run.start = {
    joints: Object.fromEntries(run.input.model.joints.map((j) => [j.name, sample.joints[ids.indexOf(j.id)]])),
    liftM: sample.height - rootHeight(run.input.model),
  };
}

function noteEvidence(run: Attempt, evidence: readonly ArenaEvidence[], score: number) {
  if (score > run.best.score) run.best = { evidence: worstEvidence(evidence) ?? null, score };
}

async function judge(run: Attempt, policy: PolicySpec): Promise<Judgement<Skill>> {
  const { input, entry, environment, clock } = run;
  const report =
    entry === 'velocity-tracking' || entry === 'settle-to-neutral'
      ? await validate(run, policy)
      : run.reports.get(policy);

  run.validation = report?.transitions.checks.length ? transitionEvidence(report.transitions) : null;

  if (report && !report.transitions.passed) {
    failedStart(run, report);

    return { skill: null, score: report.score };
  }

  const controller = { kind: 'policy' as const, policy, robot: kitRobot(input.model).key };
  const slower = await slowerSpeedEvidence({ ...input, entry, environment, policy });

  if (!slower.every((e) => e.passed)) {
    const { mj, model } = input;
    const full = await runArena({ mj, model, contract: environment.contract, controller, environment });
    const tried = [...slower, full];
    const score = arenaPasses(tried);

    noteEvidence(run, tried, score);

    return { skill: null, score: (report?.score ?? 0) + score / 1000 };
  }

  const proof = await proveSkill({
    ...input,
    name: kitSkillName(entry),
    environment,
    controller,
    kitValidation: run.validation ?? undefined,
    origin: () => {
      const { wallS, steps } = clock.cost();

      return { method: 'motor-kit', cost: { wallS, steps } };
    },
    ...(input.warm ? { warmStartFrom: input.warm.from } : {}),
  });
  const tried = [...slower, proof.evidence];
  const score = arenaPasses(tried);

  noteEvidence(run, tried, score);

  return { skill: proof.skill, score: (report?.score ?? 0) + score / 1000 };
}

async function train(run: Attempt, stage: KitStage, from: { seed: number; folder: string | null }) {
  const { input, entry, start, clock } = run;
  const { minutes, delaySteps, delayRamp } = stage;
  const job = kitJob(input.model, entry, {
    minutes,
    seed: from.seed,
    start,
    delaySteps,
    delayRamp,
    warmStart: from.folder,
    warmPolicy: from.folder ? null : input.warm?.policy,
    reverse: input.reverse,
  });
  const outcome = await runCounted(input.forge, { name: job.name, xml: input.model.xml, job }, clock.tally);

  return { policy: outcome.ok ? outcome.policy : null, folder: runFolder(outcome) };
}

export async function trainKitEntry(input: KitInput): Promise<KitOutcome> {
  const clock = new Clock();
  const entry = trainedEntry(input.entry);

  if (!kitEntries(input.model).includes(entry)) throw new Error('The Motor Kit trains robots that walk on legs.');

  const refusal = refusalFor(input.mj, input.model);

  if (refusal) return { kind: 'refused', ...refusal, cost: clock.cost() };

  const environment = kitEnvironment(input.model, entry, { reverse: input.reverse });
  const start = entry === 'get-up' ? collapsedStart(input.mj, input.model) : null;
  const starts = entry === 'velocity-tracking' || entry === 'settle-to-neutral';
  const skills = [...(starts ? await loadKitLibrary() : []), ...(input.skills ?? [])];
  const run: Attempt = {
    input: { ...input, skills },
    entry,
    environment,
    start,
    clock,
    best: { evidence: null, score: -Infinity },
    reports: new WeakMap(),
    validation: null,
  };
  const skill = await firstPassingTry({
    tries: kitSchedule(input.model, entry),
    firstSeed: input.seed ?? freshSeed(),
    train: (stage, from) => train(run, stage, from),
    validate: async (policy: PolicySpec) => (await validate(run, policy)).score,
    judge: (policy: PolicySpec) => judge(run, policy),
    aborted: () => !!input.signal?.aborted,
  });

  if (skill) return { kind: 'skill', skill, environment, cost: clock.cost() };

  const validation = run.validation?.passed === false ? run.validation : undefined;
  const reason =
    validation?.reason ?? `No ${kitSkillName(entry)} policy passed Arena within the Kit’s training budget.`;

  return {
    kind: 'refused',
    reason,
    relaxation: null,
    cost: clock.cost(),
    evidence: validation ? null : run.best.evidence,
    ...(validation ? { validation } : {}),
  };
}

export interface KitRow {
  entry: KitEntry;
  skill: string | null;
  freshness: Freshness | 'missing';
}

const RANK: Record<Freshness, number> = { fresh: 0, 'rerun-arena': 1, 'needs-training': 2 };

export function kitStatus(options: { design: string; model: SimModel; skills: Skill[] }): KitRow[] {
  const { design, model, skills } = options;

  return kitEntries(model).map((entry) => {
    const current = currentDesign({ design, model, environment: kitEnvironment(model, entry) });
    const ranked = skills
      .filter((s) => s.name === kitSkillName(entry))
      .map((skill) => ({ skill, freshness: skillFreshness(skill, current) }))
      .sort((a, b) => RANK[a.freshness] - RANK[b.freshness]);
    const best = ranked[0];

    return best
      ? { entry, skill: skillHash(best.skill), freshness: best.freshness }
      : { entry, skill: null, freshness: 'missing' };
  });
}
