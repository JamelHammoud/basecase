import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { calibratedInput } from '../reality/calibratedInput';
import { SERVO_POPULATIONS } from '../reality/servoPopulations';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { withServos } from '../sim/fixtures/servoLegs';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { currentDesign, skillFreshness, skillFromTraining, withEvidence, type ArenaEvidence } from './artifacts';
import { ArenaWorld, drawInstance, seededRandom, type ArenaRanges } from './arenaWorld';
import { environmentHash, validateEnvironment, type Environment } from './environment';
import { kitEnvironment } from './kitEnvironment';
import { kitJob } from './kitJob';
import { drawServos, SERVO_GAIN_ROWS } from './servoDraws';

const SEED = '00112233445566778899aabbccddeeff';

const quad = withServos('quad-servo', { componentId: 'feetech-sts3215', variant: 'c001' });

function inputOf(robot: FixtureRobot) {
  return {
    parts: robot.parts,
    rig: buildRig(robot.joints, robot.parts),
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
  };
}

const presetModel = buildMjcf(inputOf(quad));
const medianModel = buildMjcf(calibratedInput(inputOf(quad), {}, SERVO_POPULATIONS));
const joints = medianModel.joints.map((j) => j.id);

const oldStand = (): Environment => ({
  version: 1,
  robot: presetModel.robots[0].key,
  horizonS: 8,
  traceDt: 0.02,
  observation: [],
  action: { kind: 'position-offset', joints, scale: 0.25, controlDt: 0.02 },
  reset: { jointNoiseDeg: 3, baseYawDeg: 180, baseOffsetMm: 0 },
  randomization: { friction: [0.6, 1.3], mass: [0.85, 1.15], strength: [0.85, 1.15], latencyMs: [0, 20] },
  reward: { kind: 'contract-robustness' },
  contract: {
    version: 1,
    success: {
      always: { window: 'whole', state: { atom: { expr: { signal: 'tilt' }, cmp: '<', value: 0.5, scale: 0.5 } } },
    },
    failures: [],
  },
  signals: { tilt: { kind: 'base-tilt' } },
});

const ranges = (servos?: ArenaRanges['servos']): ArenaRanges => ({
  friction: [0.8, 1.2],
  mass: [0.9, 1.1],
  strength: [0.9, 1],
  latencyMs: [0, 40],
  jointNoiseDeg: 1,
  baseYawDeg: 0,
  baseOffsetMm: 0,
  ...(servos ? { servos } : {}),
});

describe('per-servo draws in environments', () => {
  it('still verifies an old environment’s evidence', async () => {
    const current = currentDesign({ design: 'quad', model: presetModel, environment: oldStand() });
    const skill = skillFromTraining({
      name: 'Stand',
      start: null,
      current,
      environment: oldStand(),
      controller: { kind: 'hold' },
    });
    const evidence = {
      binding: {
        contract: current.contract,
        physics: current.hashes.physics,
        actuators: current.hashes.actuators,
        environment: environmentHash(oldStand()),
      },
      passed: true,
    } as ArenaEvidence;

    expect(await validateEnvironment(oldStand(), presetModel)).toEqual([]);
    expect(withEvidence(skill, evidence, oldStand()).evidence).toBe(evidence);
  });

  it('draws each joint of a servo with a population, in a version 2 environment', async () => {
    const env = kitEnvironment(medianModel, 'stand');

    expect(env.version).toBe(2);
    expect(env.randomization.servos?.flatMap((s) => s.joints)).toEqual(joints);
    expect(await validateEnvironment(env, medianModel)).toEqual([]);
    expect(await validateEnvironment({ ...env, version: 1 }, medianModel)).toHaveLength(1);
    expect(kitEnvironment(presetModel, 'stand').version).toBe(1);
  });

  it('refuses servo spreads that differ from the robot’s own', async () => {
    const env = kitEnvironment(medianModel, 'stand');
    const narrow = env.randomization.servos!.map((s) => ({
      ...s,
      covariance: s.covariance.map((row) => row.map((v) => v / 100)),
    }));

    expect(
      await validateEnvironment({ ...env, randomization: { ...env.randomization, servos: narrow } }, medianModel),
    ).toHaveLength(1);
    expect(await validateEnvironment(env, presetModel)).toHaveLength(1);
  });

  it('marks a skill trained on the preset out of date once the population median runs', () => {
    const env = kitEnvironment(presetModel, 'stand');
    const before = currentDesign({ design: 'quad', model: presetModel, environment: env });
    const skill = skillFromTraining({
      name: 'Stand',
      start: null,
      current: before,
      environment: env,
      controller: { kind: 'hold' },
    });
    const after = currentDesign({ design: 'quad', model: medianModel, environment: env });

    expect(skillFreshness(skill, after)).toBe('rerun-arena');
  });
});

describe('the draw', () => {
  it('draws servos after everything else, so an old environment draws the same instance', () => {
    const plain = drawInstance(seededRandom(SEED), { ranges: ranges(), bodies: 5, joints: 8 });
    const drawn = drawInstance(seededRandom(SEED), {
      ranges: ranges(medianModel.servoSpreads),
      bodies: 5,
      joints: 8,
    });

    expect({ ...drawn, servos: {} }).toEqual(plain);
    expect(Object.keys(drawn.servos)).toEqual(joints);
  });

  it('follows the population’s spread and correlations', () => {
    const random = seededRandom(SEED);
    const spread = medianModel.servoSpreads![0];
    const logs = Array.from({ length: 2000 }, () => drawServos([spread], random)[spread.joints[0]]).map((d) => [
      Math.log(d.kp),
      Math.log(d.delayS),
    ]);
    const moment = (i: number, j: number) => logs.reduce((s, l) => s + l[i] * l[j], 0) / logs.length;
    const [kp, delay] = [0, 5].map((k) => spread.covariance[k][k]);
    const together = spread.covariance[0][5] / Math.sqrt(kp * delay);

    expect(moment(0, 0) / kp).toBeCloseTo(1, 0);
    expect(moment(1, 1) / delay).toBeCloseTo(1, 0);
    expect(moment(0, 1) / Math.sqrt(moment(0, 0) * moment(1, 1))).toBeCloseTo(together, 1);
  });

  it('gives the trainer one stiffness per drawn servo and none for the rest', () => {
    const job = kitJob(medianModel, 'stand', { minutes: 1, seed: 7 });
    const rows = job.servoGains!;

    expect(rows).toHaveLength(SERVO_GAIN_ROWS);
    expect(rows.every((r) => r.length === medianModel.joints.length && r.every((g) => g !== null && g > 0.25))).toBe(
      true,
    );
    expect(kitJob(medianModel, 'stand', { minutes: 1, seed: 7 }).servoGains).toEqual(rows);
    expect(kitJob(medianModel, 'stand', { minutes: 1, seed: 8 }).servoGains).not.toEqual(rows);
    expect('servoGains' in kitJob(presetModel, 'stand', { minutes: 1, seed: 7 })).toBe(false);
  });

  it('applies a drawn servo on top of Arena’s strength floor and puts it back for the next try', async () => {
    const mj = await loadMujoco();
    const world = new ArenaWorld(mj, medianModel);
    const nominal = drawInstance(seededRandom(SEED), {
      ranges: ranges(),
      bodies: medianModel.bodies.length,
      joints: 8,
    });
    const draw = { kp: 2, damping: 3, armature: 1.5, frictionloss: 0.5, forceNm: 0.8, delayS: 2 };
    const a = medianModel.joints[0].actuator;
    const dof =
      world.engine.model.jnt_dofadr[
        mj.mj_name2id(world.engine.model, mj.mjtObj.mjOBJ_JOINT.value, medianModel.joints[0].name)
      ];
    const read = () => {
      const m = world.engine.model;

      return [m.actuator_gainprm[a * 10], m.actuator_forcerange[2 * a + 1], m.actuator_delay[a], m.dof_damping[dof]];
    };

    try {
      world.prepare({
        instance: { ...nominal, strength: 1 },
        controller: { kind: 'hold' },
        start: medianModel.initial,
        robot: medianModel.robots[0].key,
      });

      const base = read();

      world.prepare({
        instance: { ...nominal, strength: 0.9, servos: { [joints[0]]: draw } },
        controller: { kind: 'hold' },
        start: medianModel.initial,
        robot: medianModel.robots[0].key,
      });
      expect(read().map((v, i) => v / base[i])).toEqual([2, 0.72, 2, 3].map((x) => expect.closeTo(x, 9)));

      world.prepare({
        instance: { ...nominal, strength: 1 },
        controller: { kind: 'hold' },
        start: medianModel.initial,
        robot: medianModel.robots[0].key,
      });
      expect(read()).toEqual(base);
    } finally {
      world.dispose();
    }
  });
});
