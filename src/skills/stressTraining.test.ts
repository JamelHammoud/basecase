import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { NOMINAL_PHYSICS, type PhysicsScales } from '../sim/physicsScales';
import { POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../sim/policy';
import { currentDesign, skillFromTraining } from './artifacts';
import type { Contract } from './contract';
import { policyObservation, type Environment } from './environment';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob } from './forgeRunner';
import { kitEnvironment } from './kitEnvironment';
import { kitRobot } from './kitModel';
import type { StressFinding } from './stress';
import { forgeConditions, FORGE_RANGES, stressJob, trainOnFindings, widenedEnvironment } from './stressTraining';

const arm = fixtureModel('arm-3dof');
const joints = ['arm0', 'arm1', 'arm2'];

const staysPut: Contract = {
  version: 1,
  success: {
    always: {
      window: 'whole',
      state: { atom: { expr: { abs: { delta: { signal: 'elbow' } } }, cmp: '<', value: 0.15, scale: 0.15 } },
    },
  },
  failures: [],
};

const armEnvironment: Environment = {
  version: 1,
  robot: arm.robots[0].key,
  horizonS: 0.6,
  traceDt: 0.02,
  observation: policyObservation(joints),
  action: { kind: 'position-offset', joints, scale: 0.25, controlDt: 0.02 },
  reset: { pose: { values: { arm1: 60 } }, jointNoiseDeg: 2, baseYawDeg: 0, baseOffsetMm: 0 },
  randomization: { friction: [0.9, 1.1], mass: [1, 1], strength: [1, 1], latencyMs: [0, 0] },
  reward: { kind: 'contract-robustness' },
  contract: staysPut,
  signals: { elbow: { kind: 'joint-position', joint: 'arm1' } },
};

function zeroPolicy(ids: string[]): PolicySpec {
  const inputs = 12 + 3 * ids.length;

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: 'Robot',
    joints: ids,
    defaultPose: ids.map(() => 0),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0, 0, 0],
    obsMean: new Array<number>(inputs).fill(0),
    obsStd: new Array<number>(inputs).fill(1),
    layers: [{ in: inputs, out: ids.length, w: new Array<number>(inputs * ids.length).fill(0), b: ids.map(() => 0) }],
    activation: 'elu',
    trainedSteps: 1,
    mujoco: 'test',
    createdAt: '',
  };
}

const finding = (axis: StressFinding['axis'], change: Partial<PhysicsScales>): StressFinding => ({
  axis,
  side: 'below',
  boundary: null,
  point: { ...NOMINAL_PHYSICS, ...change },
  start: { values: {} },
  margin: -0.4,
});

const skillOn = (model: typeof arm, environment: Environment, robot: string, ids: string[]) =>
  skillFromTraining({
    name: 'Hold',
    start: null,
    current: currentDesign({ design: 'd', model, environment }),
    environment,
    controller: { kind: 'policy', policy: zeroPolicy(ids), robot },
  });

describe('Train on These', () => {
  it('widens only the failing axis’s range, clamped to the limits', () => {
    const widened = widenedEnvironment(armEnvironment, [finding('friction', { friction: 0.3 })]);

    expect(widened.randomization).toEqual({ ...armEnvironment.randomization, friction: [0.3, 1.1] });
    expect(widenedEnvironment(armEnvironment, [finding('mass', { mass: 9 })]).randomization.mass).toEqual([1, 2]);
  });

  it('sends Forge only the widened axes, and covers a late servo with more delay steps', () => {
    expect(forgeConditions([finding('friction', { friction: 0.3 })], [0, 1])).toEqual({
      randomization: { friction: [0.3, FORGE_RANGES.friction[1]] },
      delaySteps: [0, 1],
    });
    expect(forgeConditions([finding('latencyMs', { latencyMs: 90 })], [0, 1])).toEqual({ delaySteps: [0, 5] });
  });

  it('warm-starts the Kit entry’s own job from the skill’s policy', () => {
    const model = fixtureModel('quad-servo');
    const environment = kitEnvironment(model, 'stand');
    const robot = kitRobot(model);
    const skill = skillOn(model, environment, robot.key, robot.joints);
    const job = stressJob({
      model,
      skill,
      environment,
      findings: [finding('strength', { strength: 0.5 })],
      target: { kit: 'stand' },
    });

    expect(job.warmPolicy).toEqual(skill.controller.kind === 'policy' && skill.controller.policy);
    expect(job.randomization).toEqual({ servo: [0.5, FORGE_RANGES.servo[1]] });
    expect(job.task).toBe('stand');
    expect(job.logStdMin).toBe(-2.5);
  });

  it('drops a candidate that fails Arena and saves nothing', async () => {
    const mj = await loadMujoco();
    const skill = skillOn(arm, armEnvironment, armEnvironment.robot, joints);
    const save = vi.fn(() => Promise.resolve());
    const sent: ForgeJob[] = [];
    const result = await trainOnFindings({
      mj,
      model: arm,
      design: 'd',
      skill,
      environment: armEnvironment,
      findings: [finding('friction', { friction: 0.3 })],
      job: { name: 'Stress: Hold' },
      forge: (job) => {
        sent.push(job);

        return Promise.resolve({ ok: true, policy: zeroPolicy(joints), events: [], stderr: '' });
      },
      save,
    });

    expect(sent).toHaveLength(1);
    expect(result.skill).toBeNull();
    expect(result.evidence?.passed).toBe(false);
    expect(result.reason).toContain('of 32');
    expect(result.environment.randomization.friction).toEqual([0.3, 1.1]);
    expect(save).not.toHaveBeenCalled();
  }, 60000);
});
