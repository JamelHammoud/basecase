import { CASE_RANDOMIZATION } from '../cases/caseRandom';
import { seedsUpTo, type CaseRuns } from '../cases/caseRuns';
import { caseCommand } from '../cases/caseTarget';
import type { Case } from '../cases/schema';
import { demoActionScale, DEMO_CONTROL_DT, demoEpisode } from '../datasets/demos';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { RECORD_HZ, type Recording } from '../sim/recorder';
import { trainingJob } from '../sim/trainingJob';
import { ARENA } from './arena';
import { arenaSummary, clopperPearsonLower } from './arenaStats';
import {
  contractHash,
  currentDesign,
  modelHashes,
  skillFromTraining,
  withEvidence,
  type ArenaEvidence,
  type ArenaVariantResult,
  type Skill,
  type SkillOrigin,
} from './artifacts';
import { environmentHash, policyObservation, type Environment } from './environment';
import type { ForgeJob } from './forgeRunner';
import { hashOf } from './hash';

export const TRIES_TO_TRAIN = 5;
export const TRIES_RUNS = ARENA.trials;
export const TRIES_JOINT_NOISE_DEG = 5;
export const TRIES_MINUTES = 10;
export const TRIES_STATE_NOISE = 1;

export function triesJob(model: SimModel, kase: Case, recordings: Recording[]): ForgeJob {
  const command = caseCommand(kase);
  const base = trainingJob(
    model,
    model.robots[0]?.key ?? '',
    { task: 'stand', minutes: TRIES_MINUTES, command },
    kase.name,
  );
  const actionScale = demoActionScale(recordings, model, base.defaultPose);
  const spec = { defaultPose: base.defaultPose, actionScale, command };
  const episodes = recordings.map((r) => demoEpisode(r, model, spec));

  return {
    name: kase.name,
    xml: model.xml,
    job: {
      ...base,
      algo: 'bc',
      actionScale,
      controlDt: DEMO_CONTROL_DT,
      stateNoise: TRIES_STATE_NOISE,
      demos: { episodes },
    },
  };
}

export function triesEnvironment(model: SimModel, kase: Case, policy: PolicySpec): Environment {
  return {
    version: 1,
    robot: model.robots[0]?.key ?? '',
    horizonS: kase.task.seconds,
    traceDt: 1 / RECORD_HZ,
    observation: policyObservation(policy.joints),
    action: { kind: 'position-offset', joints: policy.joints, scale: policy.actionScale, controlDt: policy.controlDt },
    reset: { jointNoiseDeg: TRIES_JOINT_NOISE_DEG, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: CASE_RANDOMIZATION,
    reward: { kind: 'contract-robustness' },
    contract: kase.task.contract,
    signals: {},
  };
}

export function triesEvidence(model: SimModel, environment: Environment, runs: CaseRuns): ArenaEvidence {
  const lowerBound = runs.refusal ? 0 : clopperPearsonLower(runs.passes, runs.runs, ARENA.confidence);
  const { physics, actuators } = modelHashes(model);
  const variants: ArenaVariantResult[] = [
    {
      variant: 'held-out',
      trials: runs.runs,
      passes: runs.passes,
      lowerBound,
      diverged: 0,
      failures: Object.fromEntries(runs.failures.map((f) => [f.label, f.runs])),
    },
  ];

  return {
    arenaVersion: ARENA.version,
    binding: {
      contract: contractHash(environment.contract),
      physics,
      actuators,
      environment: environmentHash(environment),
    },
    confidence: ARENA.confidence,
    bar: ARENA.bar,
    variants,
    lowerBound,
    passed: lowerBound >= ARENA.bar,
    conditions: [],
    summary: arenaSummary({ variants, lowerBound, confidence: ARENA.confidence }),
    saltCommitment: hashOf(seedsUpTo(runs.runs)),
  };
}

export interface TriesSkillInput {
  model: SimModel;
  design: string;
  kase: Case;
  policy: PolicySpec;
  runs: CaseRuns;
  origin: SkillOrigin;
}

export interface TriesSkill {
  skill: Skill;
  environment: Environment;
}

export function triesSkill(input: TriesSkillInput): TriesSkill | null {
  const { model, design, kase, policy, runs } = input;
  const environment = triesEnvironment(model, kase, policy);
  const evidence = triesEvidence(model, environment, runs);

  if (!evidence.passed) return null;

  const current = currentDesign({ design, model, environment });
  const controller = { kind: 'policy' as const, policy, robot: environment.robot };
  const draft = skillFromTraining({ name: kase.name, start: null, current, environment, controller });

  return { skill: { ...withEvidence(draft, evidence, environment), origin: input.origin }, environment };
}
