import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseRobot } from '../cases/testing';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { roverSetup, wheelSetups } from './driveSetup';
import { SimEngine } from './engine';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const yawOf = (engine: SimEngine) => {
  const o = 3;
  const p = engine.poses();
  const [w, x, y, z] = [p[o], p[o + 1], p[o + 2], p[o + 3]];

  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
};

function rover(mj: MainModule, id: string) {
  const r = robot(id);
  const c = caseRobot(r);
  const rig = buildRig(r.joints, r.parts);
  const model = buildMjcf({ ...c, rig, project: DEFAULT_PROJECT });
  const engine = new SimEngine(mj, model);

  engine.setController({ kind: 'drive', setup: roverSetup(rig, r.parts, rig.robots[0].key) });

  return { engine, rig };
}

describe('differential mix', () => {
  it('spin follows axis × up · forward, and sides split on a turn', () => {
    const r = robot('rover-diff');
    const rig = buildRig(r.joints, r.parts);
    const wheels = wheelSetups(rig, r.parts);
    const atPlusX = wheels.find((w) => w.joint === 'right_wheel')!;
    const atMinusX = wheels.find((w) => w.joint === 'left_wheel')!;

    expect(atPlusX.spin).toBe(1);
    expect(atMinusX.spin).toBe(1);
    expect(atPlusX.lateralMm).toBeGreaterThan(0);
    expect(atMinusX.lateralMm).toBeLessThan(0);
  });

  it('reversed axes keep the wheel rolling forward', () => {
    const r = robot('rover-diff');
    const joints = r.joints.map((j) => (j.id === 'right_wheel' ? { ...j, axis: [-1, 0, 0] as typeof j.axis } : j));
    const rig = buildRig(joints, r.parts);
    const right = wheelSetups(rig, r.parts).find((w) => w.joint === 'right_wheel')!;

    expect(right.spin).toBe(-1);
  });
});

describe('driving a rover', () => {
  it('forward moves it forward; zero stops it; a turn turns it', async () => {
    const mj = await loadMujoco();

    for (const id of ['rover-diff', 'rover-four']) {
      const { engine } = rover(mj, id);

      engine.step(0.3);
      engine.command({ v: [1, 0, 0] });
      engine.step(2);

      const moved = engine.stats().robots[0];

      expect(moved.forward).toBeGreaterThan(0.15);
      expect(moved.fellAt).toBeNull();

      engine.command({ v: [0, 0, 0] });
      engine.step(0.5);

      const before = engine.stats().robots[0].forward;

      engine.step(0.5);
      expect(Math.abs(engine.stats().robots[0].forward - before)).toBeLessThan(0.02);

      const headingBefore = yawOf(engine);

      engine.command({ v: [0, 0, 1] });
      engine.step(1);
      expect(Math.abs(yawOf(engine) - headingBefore)).toBeGreaterThan(0.2);
      engine.dispose();
    }
  });
});
