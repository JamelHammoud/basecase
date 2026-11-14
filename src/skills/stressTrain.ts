import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { contractHash, skillHash, type ArenaEvidence, type Skill, type SkillController } from './artifacts';
import { arenaJudge, type CoachJudge } from './coach';
import type { Environment, Randomization, Range } from './environment';
import { lastError, runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { kitJob } from './kitJob';
import type { TrainedEntry } from './kitEnvironment';
import { kitSchedule, type DelaySteps } from './kitSchedule';
import { STRESS_LIMITS, type StressAxis, type StressFinding } from './stress';

export const FORGE_RANGES: Readonly<Record<'friction' | 'mass' | 'strength', Range>> = Object.freeze({
  friction: [0.6, 1.3],
  mass: [0.85, 1.15],
  strength: [0.85, 1.15],
});

const MAX_DELAY_STEPS = 8;
const LOG_STD_MIN = -2.5;

const KEY: Record<StressAxis, keyof Randomization> = {
  friction: 'friction',
  mass: 'mass',
  strength: 'strength',
  latencyMs: 'latencyMs',
};

const clamp = (axis: StressAxis, v: number) => Math.max(STRESS_LIMITS[axis][0], Math.min(STRESS_LIMITS[axis][1], v));

const spanned = (r: Range, values: number[]): Range => [Math.min(r[0], ...values), Math.max(r[1], ...values)];

export function widenedEnvironment(environment: Environment, findings: readonly StressFinding[]): Environment {
  const randomization = { ...environment.randomization };

  for (const f of findings) {
    const key = KEY[f.axis];
    const failing = [f.boundary, f.replay[f.axis]].map((v) => clamp(f.axis, v));

    randomization[key] = spanned(randomization[key], failing);
  }

  return { ...environment, randomization };
}

function delaySteps(base: DelaySteps, latencyMs: Range, controlDt: number): DelaySteps {
  const most = Math.min(MAX_DELAY_STEPS, Math.ceil(latencyMs[1] / 1000 / controlDt - 1e-9));

  return [base[0], Math.max(base[1], most)];
}

export function stressJob(input: { model: SimModel; entry: TrainedEntry; skill: Skill; environment: Environment }) {
  const { model, entry, skill, environment } = input;
  const { minutes, delaySteps: base } = kitSchedule(model, entry).at(-1)!.stages[0];
  const { randomization: r, action } = environment;
  const policy = skill.controller.kind === 'policy' ? skill.controller.policy : null;
  const job = kitJob(model, entry, {
    minutes,
    seed: 1,
    delaySteps: delaySteps(base, r.latencyMs, action.controlDt),
  });

  return {
    ...job,
    name: `Stress: ${skill.name}`,
    warmPolicy: policy,
    logStdMin: LOG_STD_MIN,
    randomization: {
      friction: spanned(FORGE_RANGES.friction, r.friction),
      mass: spanned(FORGE_RANGES.mass, r.mass),
      strength: spanned(FORGE_RANGES.strength, r.strength),
    },
  };
}

export interface StressTraining {
  mj: MainModule;
  model: SimModel;
  design: string;
  entry: TrainedEntry;
  skill: Skill;
  environment: Environment;
  findings: readonly StressFinding[];
  forge: ForgeRunner;
  save: SkillSave;
  judge?: CoachJudge;
}

export type StressTrainOutcome =
  | { kind: 'kept'; skill: Skill; evidence: ArenaEvidence; environment: Environment }
  | { kind: 'dropped'; reason: string; evidence: ArenaEvidence | null };

function refusal(input: StressTraining): string | null {
  const { skill, environment, findings } = input;

  if (!findings.length) return 'No findings to train on.';

  if (skill.controller.kind !== 'policy') return `Training on findings retrains a policy, and ${skill.name} isn’t one.`;

  return skill.binding.contract === contractHash(environment.contract)
    ? null
    : 'The skill was proved on another contract. Recheck it in Arena first.';
}

export async function trainOnFindings(input: StressTraining): Promise<StressTrainOutcome> {
  const refused = refusal(input);

  if (refused) return { kind: 'dropped', reason: refused, evidence: null };

  const { mj, model, skill } = input;
  const environment = widenedEnvironment(input.environment, input.findings);
  const job = stressJob({ ...input, environment });
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const startedAt = Date.now();
  const outcome = await runCounted(input.forge, { name: job.name, xml: model.xml, job }, tally);

  if (!outcome.ok || !outcome.policy) return { kind: 'dropped', reason: lastError(outcome), evidence: null };

  const controller: SkillController = { kind: 'policy', policy: outcome.policy, robot: environment.robot };
  const proof = await (input.judge ?? arenaJudge(mj, model)).prove({
    mj,
    model,
    design: input.design,
    name: skill.name,
    environment,
    controller,
    save: input.save,
    warmStartFrom: skillHash(skill),
    origin: () => ({
      method: skill.origin?.method ?? 'motor-kit',
      cost: { wallS: (Date.now() - startedAt) / 1000, steps: tally.steps },
    }),
  });

  if (!proof.skill) return { kind: 'dropped', reason: proof.evidence.summary, evidence: proof.evidence };

  return { kind: 'kept', skill: proof.skill, evidence: proof.evidence, environment };
}
