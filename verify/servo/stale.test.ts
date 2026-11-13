import { describe, expect, it } from 'vitest';
import { walkSim, type PeakDeps } from '../../src/agent/agentPeak';
import { simulateRequest, trainingStatusText, type SimContext } from '../../src/agent/agentSim';
import { SIM_MODEL_VERSION } from '../../src/sim/mjcf';
import { isStalePolicy } from '../../src/sim/policyFreshness';
import { trainingJob } from '../../src/sim/trainingJob';
import type { Training } from '../../src/sim/useTraining';
import type { PolicyRecord } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';
import { CATALOG_SERVOS, pendulumModel } from './pendulum';

const OLD_VERSION = 0;

const policy = (modelVersion: number | undefined): PolicyRecord => ({
  id: `p${modelVersion ?? 'none'}`,
  name: `walker-v${modelVersion ?? 'none'}`,
  task: 'walk',
  robot: 'r',
  robotName: 'Walker',
  command: [0.2, 0, 0],
  trainedSteps: 1e6,
  ...(modelVersion === undefined ? {} : { modelVersion }),
  createdAt: '2026-11-07T00:00:00.000Z',
});

const unreachable = () => {
  throw new Error('A stale policy must be refused before anything runs');
};

const training = {
  status: 'idle',
  message: null,
  error: null,
  progress: null,
  curve: [],
  canTrain: true,
  blocker: null,
  start: unreachable,
  stop: unreachable,
  loadPolicy: unreachable,
} as unknown as Training;

const sim = new Proxy({}, { get: unreachable }) as SimContext['sim'];

function context(policies: PolicyRecord[]): SimContext {
  const model = pendulumModel(CATALOG_SERVOS.sts3215, { massKg: 0.2, armM: 0.1, bobSideM: 0.02 });

  return {
    sim,
    training,
    rig: buildRig(
      model.joints.map((j) => ({
        id: j.id,
        name: j.name,
        type: 'revolute',
        parent: ['a'],
        child: ['b'],
        origin: [0, 0, 0],
        axis: [1, 0, 0],
      })),
      [],
    ),
    animations: [],
    policies,
    viewport: null,
    restoreCanvas: () => {},
  };
}

describe('policies trained before the servo models read as stale', () => {
  it('the sim model version moved past the old one', () => {
    expect(SIM_MODEL_VERSION).toBeGreaterThan(OLD_VERSION);
  });

  it('isStalePolicy flags the old version and unversioned records, not the current one', () => {
    expect(isStalePolicy(policy(OLD_VERSION))).toBe(true);
    expect(isStalePolicy(policy(undefined))).toBe(true);
    expect(isStalePolicy(policy(SIM_MODEL_VERSION))).toBe(false);
  });

  it('new models and training jobs carry the current version', () => {
    const model = pendulumModel(CATALOG_SERVOS.xl330, { massKg: 0.05, armM: 0.05, bobSideM: 0.02 });

    expect(model.version).toBe(SIM_MODEL_VERSION);
    expect(
      trainingJob(model, model.robots[0].key, { task: 'stand', minutes: 1, command: [0, 0, 0] }, 'x').modelVersion,
    ).toBe(SIM_MODEL_VERSION);
  });

  it('the simulate tool refuses to run an old policy', async () => {
    const old = policy(OLD_VERSION);
    const reply = await simulateRequest(context([old]), { controller: `policy:${old.name}` });

    expect(reply.text).toMatch(/older sim/);
  });

  it('the peak-torque check refuses an old walk policy', async () => {
    const deps: PeakDeps = { sim, training, policies: [policy(OLD_VERSION)] };

    expect(await walkSim(deps, { joints: [], massG: 1000, parts: [] })).toMatch(/older sim/);
  });

  it('training_status marks old policies and leaves current ones alone', () => {
    const text = trainingStatusText(context([policy(OLD_VERSION), policy(SIM_MODEL_VERSION)]));
    const lines = text.split('\n');

    expect(lines.find((l) => l.includes(`walker-v${OLD_VERSION}`))).toMatch(/older sim/);
    expect(lines.find((l) => l.includes(`walker-v${SIM_MODEL_VERSION}`))).not.toMatch(/older sim/);
  });
});
