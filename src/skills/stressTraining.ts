import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { NOMINAL_PHYSICS } from '../sim/physicsScales';
import { skillHash, type ArenaEvidence, type Skill } from './artifacts';
import type { Environment, Randomization, Range } from './environment';
import { lastError, runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import { kitJob } from './kitJob';
import { kitSchedule, type DelaySteps, type KitTry } from './kitSchedule';
import { moveJob } from './moveJob';
import { moveSchedule } from './moveSchedule';
import { proveSkill } from './prove';
import { STRESS_AXES, STRESS_LIMITS, type StressAxis, type StressFinding } from './stress';

export const FORGE_RANGES = Object.freeze({
  friction: Object.freeze([0.6, 1.3] as Range),
  mass: Object.freeze([0.85, 1.15] as Range),
  servo: Object.freeze([0.85, 1.15] as Range),
});

const CONTROL_MS = 20;
const MAX_DELAY_STEPS = 8;
const LOG_STD_MIN = -2.5;
const MOVED = 1e-6;

type FailingValues = Partial<Record<StressAxis, number[]>>;

const movedAxes = (finding: StressFinding) =>
  finding.axis === 'combined'
    ? STRESS_AXES.filter((axis) => Math.abs(finding.point[axis] - NOMINAL_PHYSICS[axis]) > MOVED)
    : [finding.axis];

export function failingValues(findings: StressFinding[]): FailingValues {
  const values: FailingValues = {};

  for (const finding of findings)
    for (const axis of movedAxes(finding)) values[axis] = [...(values[axis] ?? []), finding.point[axis]];

  return values;
}

function cover(range: Readonly<Range>, values: number[], limits: Readonly<Range>): Range {
  const lo = Math.min(range[0], ...values);
  const hi = Math.max(range[1], ...values);

  return [Math.max(limits[0], lo), Math.min(limits[1], hi)];
}

export function widenedEnvironment(environment: Environment, findings: StressFinding[]): Environment {
  const values = failingValues(findings);
  const randomization = Object.fromEntries(
    STRESS_AXES.map((axis) => {
      const range = environment.randomization[axis];
      const failing = values[axis];

      return [axis, failing ? cover(range, failing, STRESS_LIMITS[axis]) : range];
    }),
  ) as unknown as Randomization;

  return { ...environment, randomization };
}

export function forgeConditions(findings: StressFinding[], delaySteps: DelaySteps) {
  const values = failingValues(findings);
  const ranges = {
    ...(values.friction ? { friction: cover(FORGE_RANGES.friction, values.friction, STRESS_LIMITS.friction) } : {}),
    ...(values.mass ? { mass: cover(FORGE_RANGES.mass, values.mass, STRESS_LIMITS.mass) } : {}),
    ...(values.strength ? { servo: cover(FORGE_RANGES.servo, values.strength, STRESS_LIMITS.strength) } : {}),
  };
  const lateMs = Math.max(0, ...(values.latencyMs ?? []));
  const late = Math.min(MAX_DELAY_STEPS, Math.max(delaySteps[1], Math.ceil(lateMs / CONTROL_MS)));

  return {
    ...(Object.keys(ranges).length ? { randomization: ranges } : {}),
    delaySteps: [delaySteps[0], late] as DelaySteps,
  };
}

export type StressTarget = { kit: TrainedEntry } | { move: string };

const lastStage = (tries: readonly KitTry[]) => tries.at(-1)!.stages.at(-1)!;

export interface StressJobInput {
  model: SimModel;
  skill: Skill;
  environment: Environment;
  findings: StressFinding[];
  target: StressTarget;
  seed?: number;
}

function baseJob(input: StressJobInput, delaySteps: DelaySteps) {
  const { model, environment, target, skill } = input;
  const seed = input.seed ?? 1;

  if ('kit' in target) {
    const { minutes } = lastStage(kitSchedule(model, target.kit));

    return kitJob(model, target.kit, { minutes, seed, delaySteps });
  }

  const { minutes } = lastStage(moveSchedule(model));

  return moveJob(model, environment, { name: skill.name, minutes, seed, delaySteps });
}

export function stressJob(input: StressJobInput): Record<string, unknown> {
  const { skill, model, target } = input;

  if (skill.controller.kind !== 'policy') throw new Error('Only a trained policy trains again.');

  const tries = 'kit' in target ? kitSchedule(model, target.kit) : moveSchedule(model);
  const conditions = forgeConditions(input.findings, lastStage(tries).delaySteps);

  return {
    ...baseJob(input, conditions.delaySteps),
    ...conditions,
    name: `Stress: ${skill.name}`,
    logStdMin: LOG_STD_MIN,
    warmPolicy: skill.controller.policy,
  };
}

export interface StressTrainInput {
  mj: MainModule;
  model: SimModel;
  design: string;
  skill: Skill;
  environment: Environment;
  findings: StressFinding[];
  job: Record<string, unknown>;
  forge: ForgeRunner;
  save: SkillSave;
}

export interface StressTrainResult {
  skill: Skill | null;
  evidence: ArenaEvidence | null;
  environment: Environment;
  reason: string;
}

export async function trainOnFindings(input: StressTrainInput): Promise<StressTrainResult> {
  const { mj, model, skill, job } = input;
  const environment = widenedEnvironment(input.environment, input.findings);
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const startedAt = Date.now();
  const outcome = await runCounted(input.forge, { name: String(job.name), xml: model.xml, job }, tally);

  if (!outcome.ok || !outcome.policy) return { skill: null, evidence: null, environment, reason: lastError(outcome) };

  const proof = await proveSkill({
    mj,
    model,
    design: input.design,
    name: skill.name,
    environment,
    controller: { kind: 'policy', policy: outcome.policy, robot: environment.robot },
    save: input.save,
    origin: () => ({
      method: skill.origin?.method ?? 'motor-kit',
      cost: { wallS: (Date.now() - startedAt) / 1000, steps: tally.steps },
    }),
    warmStartFrom: skillHash(skill),
  });

  return { skill: proof.skill, evidence: proof.evidence, environment, reason: proof.evidence.summary };
}
