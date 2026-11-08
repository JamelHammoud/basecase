import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { currentDesign, skillFreshness, skillHash, type Freshness, type Skill } from './artifacts';
import type { Environment } from './environment';
import { checkFeasibility, type LadderChange } from './feasibility';
import { runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { kitEnvironment, LEGGED_ENTRIES, trainedEntry, type KitEntry, type TrainedEntry } from './kitEnvironment';
import { holdsSlowerSpeeds } from './kitAcceptance';
import { kitJob, type KitStart } from './kitJob';
import { kitRobot } from './kitModel';
import { kitSchedule } from './kitSchedule';
import { collapsedStart } from './kitStart';
import { proveSkill } from './prove';

export type { ForgeJob, ForgeOutcome, ForgeRunner, SkillSave } from './forgeRunner';
export type { KitEntry } from './kitEnvironment';
export { kitEnvironment } from './kitEnvironment';

export interface KitCost {
  wallS: number;
  steps: number;
  forgeRuns: number;
}

export type KitOutcome =
  | { kind: 'skill'; skill: Skill; environment: Environment; cost: KitCost }
  | {
      kind: 'refused';
      reason: string;
      relaxation: { change: LadderChange; message: string } | null;
      cost: KitCost;
    };

export interface KitInput {
  mj: MainModule;
  design: string;
  model: SimModel;
  entry: KitEntry;
  forge: ForgeRunner;
  save: SkillSave;
  signal?: AbortSignal;
}

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

  cost(): KitCost {
    return { wallS: (performance.now() - this.started) / 1000, ...this.tally };
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
}

async function attempt(run: Attempt, options: { minutes: number; seed: number }) {
  const { input, entry, environment, start, clock } = run;
  const job = kitJob(input.model, entry, { ...options, start });
  const outcome = await runCounted(input.forge, { name: job.name, xml: input.model.xml, job }, clock.tally);

  if (!outcome.ok || !outcome.policy) return null;

  const controller = { kind: 'policy' as const, policy: outcome.policy, robot: kitRobot(input.model).key };
  const steady = await holdsSlowerSpeeds({ ...input, entry, environment, policy: outcome.policy });

  if (!steady) return null;

  const proof = await proveSkill({
    ...input,
    name: kitSkillName(entry),
    environment,
    controller,
    origin: () => {
      const { wallS, steps } = clock.cost();

      return { method: 'motor-kit', cost: { wallS, steps } };
    },
  });

  return proof.skill;
}

export async function trainKitEntry(input: KitInput): Promise<KitOutcome> {
  const clock = new Clock();
  const entry = trainedEntry(input.entry);

  if (!kitEntries(input.model).includes(entry)) throw new Error('The Motor Kit trains robots that walk on legs.');

  const refusal = refusalFor(input.mj, input.model);

  if (refusal) return { kind: 'refused', ...refusal, cost: clock.cost() };

  const environment = kitEnvironment(input.model, entry);
  const start = entry === 'get-up' ? collapsedStart(input.mj, input.model) : null;
  const run: Attempt = { input, entry, environment, start, clock };

  for (const [index, minutes] of kitSchedule(input.model, entry).entries()) {
    if (input.signal?.aborted) break;

    const skill = await attempt(run, { minutes, seed: index + 1 });

    if (skill) return { kind: 'skill', skill, environment, cost: clock.cost() };
  }

  const reason = `No ${kitSkillName(entry)} policy passed Arena within the Kit’s training budget.`;

  return { kind: 'refused', reason, relaxation: null, cost: clock.cost() };
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
