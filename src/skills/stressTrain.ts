import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { contractHash, skillHash, type ArenaEvidence, type Skill, type SkillController } from './artifacts';
import type { Environment, Range } from './environment';
import { lastError, runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { kitJob } from './kitJob';
import type { TrainedEntry } from './kitEnvironment';
import { kitSchedule } from './kitSchedule';
import { proveSkill, type ProveInput, type Proof } from './prove';
import { widenedEnvironment, type StressFinding } from './stress';

export const FORGE_RANGES = Object.freeze({
  friction: Object.freeze([0.6, 1.3] as const),
  mass: Object.freeze([0.85, 1.15] as const),
});

const LOG_STD_MIN = -2.5;
const CONTROL_DT_MS = 20;

export interface StressTraining {
  mj: MainModule;
  model: SimModel;
  design: string;
  entry: TrainedEntry;
  skill: Skill;
  environment: Environment;
  reward: string;
  findings: StressFinding[];
  forge: ForgeRunner;
  save: SkillSave;
  seed?: number;
  prove?: (input: ProveInput) => Promise<Proof>;
}

export type StressTrainOutcome =
  | { kind: 'kept'; skill: Skill; evidence: ArenaEvidence; environment: Environment }
  | { kind: 'dropped'; reason: string; evidence: ArenaEvidence | null }
  | { kind: 'refused'; reason: string };

const union = (a: readonly [number, number], b: Range): Range => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];

const sameRange = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];

type JobInput = Pick<StressTraining, 'model' | 'entry' | 'skill' | 'environment' | 'reward' | 'seed'> & {
  strength?: boolean;
};

export function stressJob(input: JobInput) {
  const { model, entry, skill, environment, reward } = input;
  const widened = environment.randomization;
  const { minutes, delaySteps } = kitSchedule(model, entry).at(-1)!.stages[0];
  const late = Math.ceil(widened.latencyMs[1] / CONTROL_DT_MS);
  const policy = skill.controller.kind === 'policy' ? skill.controller.policy : null;
  const job = kitJob(model, entry, {
    minutes,
    seed: input.seed ?? 1,
    reward,
    delaySteps: [delaySteps[0], Math.max(delaySteps[1], late)],
    physicsRanges: {
      friction: union(FORGE_RANGES.friction, widened.friction),
      mass: union(FORGE_RANGES.mass, widened.mass),
      ...(input.strength ? { strength: widened.strength } : {}),
    },
  });

  return { ...job, name: `Stress: ${skill.name}`, warmPolicy: policy, logStdMin: LOG_STD_MIN };
}

function subjectProblem(input: StressTraining): string | null {
  const { skill, environment, findings } = input;

  if (!findings.length) return `${skill.name} has no findings to train on.`;

  if (skill.controller.kind !== 'policy') return `Training on findings retrains a policy, and ${skill.name} isn’t one.`;

  return skill.binding.contract === contractHash(environment.contract)
    ? null
    : 'The skill was proved on another contract. Recheck it in Arena first.';
}

export async function trainOnFindings(input: StressTraining): Promise<StressTrainOutcome> {
  const refused = subjectProblem(input);

  if (refused) return { kind: 'refused', reason: refused };

  const { mj, model, skill } = input;
  const environment = widenedEnvironment(input.environment, input.findings);
  const strength = !sameRange(environment.randomization.strength, input.environment.randomization.strength);
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const startedAt = Date.now();
  const job = stressJob({ ...input, environment, strength });
  const outcome = await runCounted(input.forge, { name: job.name, xml: model.xml, job }, tally);

  if (!outcome.ok || !outcome.policy) return { kind: 'dropped', reason: lastError(outcome), evidence: null };

  const controller: SkillController = { kind: 'policy', policy: outcome.policy, robot: environment.robot };
  const proof = await (input.prove ?? proveSkill)({
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
