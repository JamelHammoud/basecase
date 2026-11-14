import type { PolicySpec } from '../sim/policy';
import type { SimModel } from '../sim/mjcfTypes';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import { ARENA } from './arena';
import {
  currentDesign,
  skillFromTraining,
  withEvidence,
  type ArenaEvidence,
  type ArenaVariant,
  type Skill,
} from './artifacts';
import { environmentHash } from './environment';
import { hashOf } from './hash';
import { kitEnvironment } from './kitEnvironment';
import { kitJob } from './kitJob';
import { kitRobot } from './kitModel';

export function holdingPolicy(job: Record<string, unknown>, gain = 0): PolicySpec {
  const spec = job as { joints: Array<{ id: string }>; robotName: string; defaultPose: number[] };
  const joints = spec.joints.map((j) => j.id);
  const n = joints.length;
  const inputs = 12 + 3 * n;
  const w = new Array<number>(inputs * n).fill(0);

  for (let o = 0; o < n; o++) w[o * inputs + 12 + n + o] = gain;

  return {
    format: 'basecase-policy',
    version: 1,
    task: 'stand',
    robot: spec.robotName,
    joints,
    defaultPose: spec.defaultPose,
    actionScale: job.actionScale as number,
    controlDt: job.controlDt as number,
    command: job.command as [number, number, number],
    obsMean: new Array<number>(inputs).fill(0),
    obsStd: new Array<number>(inputs).fill(1),
    layers: [{ in: inputs, out: n, w, b: new Array<number>(n).fill(0) }],
    activation: 'elu',
    trainedSteps: 1,
    mujoco: 'stub',
    createdAt: '2026-11-13T00:00:00',
  };
}

const VARIANTS: ArenaVariant[] = ['held-out', 'half-timestep', 'latency'];

export function readyStand(model: SimModel, design: string): Skill {
  const environment = kitEnvironment(model, 'stand');
  const policy = holdingPolicy(kitJob(model, 'stand', { minutes: 1, seed: 1 }));
  const current = currentDesign({ design, model, environment });
  const controller = { kind: 'policy' as const, policy, robot: kitRobot(model).key };
  const trained = skillFromTraining({ name: 'Stand', start: null, current, environment, controller });
  const evidence: ArenaEvidence = {
    arenaVersion: ARENA.version,
    binding: { ...current.hashes, contract: current.contract, environment: environmentHash(environment) },
    confidence: 0.95,
    bar: 0.75,
    variants: VARIANTS.map((variant) => ({
      variant,
      trials: 32,
      passes: 32,
      lowerBound: 0.91,
      diverged: 0,
      failures: {},
    })),
    lowerBound: 0.91,
    passed: true,
    conditions: [],
    summary: 'Passed 32 of 32 in each run.',
    saltCommitment: hashOf('salt'),
  };

  return {
    ...withEvidence(trained, evidence, environment),
    origin: { method: 'motor-kit', cost: { wallS: 1, steps: 1 } },
  };
}

export function stubForge(gain = 0) {
  const jobs: ForgeJob[] = [];
  const forge = (job: ForgeJob): Promise<ForgeOutcome> => {
    jobs.push(job);

    return Promise.resolve({ ok: true, policy: holdingPolicy(job.job, gain), events: [], stderr: '' });
  };

  return { jobs, forge };
}
