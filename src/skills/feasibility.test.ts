import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { box, joint } from '../sim/fixtures/parts';
import type { RobotJoint } from '../types/robotics';
import { checkFeasibility } from './feasibility';
import { gravityTorques, holdingTorques } from './feasibilityChecks';
import { closeKin, openKin } from './feasibilityKinematics';
import { editParts, fixtureModel, fixtureRobot, modelOf } from './fixtureModels';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const AS_BUILT = { effortScale: 1, rangeDeg: 0, linkScale: 1 };

function gripper(fingerRange: [number, number]) {
  const parts = [box('palm', [0, 20, 0], [80, 40, 40], 300), box('left', [-20, 70, 0], [10, 60, 10], 20)];
  const right = box('right', [20, 70, 0], [10, 60, 10], 20);
  const finger = (id: string, part: string, x: number): RobotJoint =>
    joint({ id, link: ['palm', part], origin: [x, 40, 0], axis: [0, 0, 1], effortNm: 1, range: fingerRange });

  return { parts: [...parts, right], joints: [finger('jaw_l', 'left', -20), finger('jaw_r', 'right', 20)] };
}

describe('holding torque', () => {
  it('diagnoses the weak quad as too weak, in plain words, and finds the smallest fix', () => {
    const report = checkFeasibility(mj, fixtureModel('must-fail-weak-quad'), { stand: true });
    const torque = report.checks.find((c) => c.id === 'holding-torque')!;

    expect(report.feasible).toBe(false);
    expect(torque.passed).toBe(false);
    expect(torque.message).toMatch(/^Too weak to stand/);
    expect(torque.message).toMatch(/N·m/);
    expect(report.relaxation?.change).toBe('torque-x2');
    expect(report.summary).toMatch(/twice the torque/);
  });

  it('lets the same quad with real servos stand', () => {
    const report = checkFeasibility(mj, fixtureModel('quad-servo'), { stand: true });

    expect(report.feasible).toBe(true);
    expect(report.relaxation).toBeNull();
  });

  it('comes from mj_inverse, and matches the change in potential energy', () => {
    const kin = openKin(mj, fixtureModel('arm-6dof'), { relax: AS_BUILT });

    kin.data.qpos[kin.joints[1].qpos] = Math.PI / 2;

    const fromInverse = gravityTorques(kin);
    const extended = holdingTorques(kin, []);
    const lever = 0.07 * 5;

    closeKin(kin);
    expect(fromInverse).toEqual(extended);
    expect(Math.abs(fromInverse[1])).toBeGreaterThan(0.06 * 9.81 * lever * 0.9);
  });

  it('refuses a payload a servo can’t hold out sideways, with the exact basis', () => {
    const tipJoint = 'arm5';
    const report = checkFeasibility(mj, fixtureModel('arm-6dof'), {
      hold: { poses: [{ values: { arm1: 90 } }], payloadKg: 1.5, tipJoint },
    });
    const check = report.checks[0];

    expect(check).toMatchObject({ id: 'holding-torque', passed: false, basis: 'exact', joint: 'arm0' });
    expect(report.relaxation).toBeNull();
  });
});

describe('support polygon', () => {
  it('says a quad with its weight hung out front tips over', () => {
    const quad = fixtureRobot('quad-servo');
    const nose = editParts(quad, (p) => (p.id === 'body' ? { ...p, position: [0, 155, 200], massG: 3000 } : p));
    const report = checkFeasibility(mj, modelOf(nose), { stand: true });
    const support = report.checks.find((c) => c.id === 'support')!;

    expect(support.passed).toBe(false);
    expect(support.message).toMatch(/^It tips over/);
    expect(support.marginMm).toBeLessThan(0);
  });

  it('measures a positive margin for a balanced biped', () => {
    const report = checkFeasibility(mj, fixtureModel('biped-servo'), { stand: true });

    expect(report.checks.find((c) => c.id === 'support')!.marginMm).toBeGreaterThan(0);
  });
});

describe('workspace', () => {
  it('reaches a point the arm can reach by sampled FK', () => {
    const report = checkFeasibility(mj, fixtureModel('arm-6dof'), {
      reach: { targetMm: [0, 300, 150], tipJoint: 'arm5' },
    });

    expect(report.feasible).toBe(true);
  });

  it('proves a target past the arm’s length out of reach, and links 20% longer fix it', () => {
    const report = checkFeasibility(mj, fixtureModel('arm-6dof'), {
      reach: { targetMm: [0, 510, 0], tipJoint: 'arm5' },
    });

    expect(report.checks[0]).toMatchObject({ id: 'reach', passed: false, basis: 'exact' });
    expect(report.checks[0].message).toMatch(/^Out of reach/);
    expect(report.relaxation?.change).toBe('link+20pct');
  });
});

describe('gripper opening', () => {
  it('passes an object that fits and refuses one that doesn’t, with range +20° as the fix', () => {
    const model = modelOf(gripper([0, 20]));
    const fits = checkFeasibility(mj, model, { grip: { objectMm: 30, jaws: ['jaw_l', 'jaw_r'], fingerMm: 60 } });
    const wide = checkFeasibility(mj, model, { grip: { objectMm: 50, jaws: ['jaw_l', 'jaw_r'], fingerMm: 60 } });

    expect(fits.feasible).toBe(true);
    expect(wide.feasible).toBe(false);
    expect(wide.checks[0].message).toMatch(/opens 41.7 mm/);
    expect(wide.relaxation?.change).toBe('range+20deg');
  });
});
