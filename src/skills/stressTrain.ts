import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { skillHash, type ArenaEvidence, type Skill, type SkillController } from './artifacts';
import { arenaJudge, type CoachJudge } from './coach';
import type { Environment, Randomization, Range } from './environment';
import { lastError, runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { kitJob } from './kitJob';
import type { TrainedEntry } from './kitEnvironment';
import { kitSchedule } from './kitSchedule';
import { STRESS_LIMITS, type StressAxisResult } from './stress';
import type { StressAxis } from './stressProbe';

export const STRESS_STEP = 1 / 8;

export const FORGE_RANGES = Object.freeze({
  friction: Object.freeze([0.6, 1.3] as const),
  mass: Object.freeze([0.85, 1.15] as const),
});

const MAX_DELAY_STEPS = 8;

export type StressJudge = Pick<CoachJudge, 'prove'>;

export interface StressTraining {
  mj: MainModule;
  model: SimModel;
  design: string;
  entry: TrainedEntry;
  skill: Skill;
  environment: Environment;
  findings: StressAxisResult[];
  forge: ForgeRunner;
  save: SkillSave;
  reward?: string;
  seed?: number;
  judge?: StressJudge;
}

export type StressTrainOutcome =
  | { kind: 'kept'; skill: Skill; evidence: ArenaEvidence; environment: Environment }
  | { kind: 'dropped'; reason: string; evidence: ArenaEvidence | null }
  | { kind: 'refused'; reason: string };

const clampTo = (axis: StressAxis, v: number) => Math.max(STRESS_LIMITS[axis][0], Math.min(STRESS_LIMITS[axis][1], v));

function widenedRange(range: Range, finding: StressAxisResult): Range {
  const { axis, side, boundary } = finding;

  if (boundary === null) return range;

  const step = STRESS_STEP * (STRESS_LIMITS[axis][1] - STRESS_LIMITS[axis][0]);

  if (side === 'below') return [Math.min(range[0], clampTo(axis, boundary - step)), range[1]];

  return [range[0], Math.max(range[1], clampTo(axis, boundary + step))];
}

export function widenedEnvironment(environment: Environment, findings: StressAxisResult[]): Environment {
  const randomization: Randomization = { ...environment.randomization };

  for (const finding of findings) randomization[finding.axis] = widenedRange(randomization[finding.axis], finding);

  return { ...environment, randomization };
}

const union = (a: readonly [number, number], b: Range): Range => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];

export function weakerXml(xml: string, strength: number): string {
  if (strength >= 1) return xml;

  return xml.replace(
    /forcerange="([^"]+)"/g,
    (_, values: string) =>
      `forcerange="${values
        .trim()
        .split(/\s+/)
        .map((v) => String(Number(v) * strength))
        .join(' ')}"`,
  );
}

export function stressJob(
  input: Pick<StressTraining, 'model' | 'entry' | 'skill' | 'reward' | 'seed'>,
  env: Environment,
) {
  const { model, entry, skill } = input;
  const stage = kitSchedule(model, entry).at(-1)!.stages[0];
  const r = env.randomization;
  const late = Math.ceil(r.latencyMs[1] / (env.action.controlDt * 1000) - 1e-9);
  const delaySteps = [0, Math.min(MAX_DELAY_STEPS, Math.max(stage.delaySteps[1], late))] as const;
  const policy = skill.controller.kind === 'policy' ? skill.controller.policy : null;
  const job = kitJob(model, entry, {
    minutes: stage.minutes,
    seed: input.seed ?? 1,
    reward: input.reward,
    delaySteps,
    warmPolicy: policy,
  });

  return {
    name: `Stress: ${skill.name}`,
    xml: weakerXml(model.xml, Math.min(1, r.strength[0])),
    job: {
      ...job,
      name: `Stress: ${skill.name}`,
      randomRanges: { friction: union(FORGE_RANGES.friction, r.friction), mass: union(FORGE_RANGES.mass, r.mass) },
    },
  };
}

function trainProblem(input: StressTraining): string | null {
  if (input.skill.controller.kind !== 'policy')
    return `Train on These retrains a policy, and ${input.skill.name} isn’t one.`;

  return input.findings.some((f) => f.boundary !== null) ? null : 'Stress found nothing to train on.';
}

export async function trainOnFindings(input: StressTraining): Promise<StressTrainOutcome> {
  const problem = trainProblem(input);

  if (problem) return { kind: 'refused', reason: problem };

  const { mj, model, skill } = input;
  const environment = widenedEnvironment(input.environment, input.findings);
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const startedAt = Date.now();
  const outcome = await runCounted(input.forge, stressJob(input, environment), tally);

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
