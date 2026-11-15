import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SimEngine } from '../sim/engine';
import { Ik, targetValue, type IkJoint, type IkTarget } from './anythingIk';
import { shareWeight } from './feasibilityStance';
import { fixtureModel } from './fixtureModels';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function countSlices<T>(action: () => T) {
  const slice = vi.spyOn(Array.prototype, 'slice');

  try {
    const result = action();
    const copies = slice.mock.calls.length;

    return { result, copies };
  } finally {
    slice.mockRestore();
  }
}

function armProblem(engine: SimEngine) {
  const joints: IkJoint[] = engine.sim.joints.map((j) => {
    const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, j.name);
    const range = j.range ?? [-180, 180];

    return { qpos: engine.model.jnt_qposadr[id], range: [(range[0] * Math.PI) / 180, (range[1] * Math.PI) / 180] };
  });
  const body = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, engine.sim.bodies.at(-1)!.name);
  const start = Array.from(engine.data.qpos as ArrayLike<number>);

  for (const joint of joints) engine.data.qpos[joint.qpos] += 0.15;

  mj.mj_kinematics(engine.model, engine.data);

  const targets: IkTarget[] = ([0, 1, 2] as const).map((axis) => ({ body, axis, value: 0, local: [0, 0, 0.05] }));

  for (const target of targets) target.value = targetValue(engine.data, target);

  return { start, joints, targets };
}

describe('dense skill solves', () => {
  it.each(['arm-3dof', 'arm-6dof'])('reaches planted targets on %s without copying solver tails', (id) => {
    const engine = new SimEngine(mj, fixtureModel(id));

    try {
      const { start, joints, targets } = armProblem(engine);
      const original = [...start];

      engine.data.qpos.set(start);
      mj.mj_kinematics(engine.model, engine.data);
      expect(Math.hypot(...targets.map((target) => target.value - targetValue(engine.data, target)))).toBeGreaterThan(
        0.01,
      );

      const { result, copies } = countSlices(() => new Ik(mj, engine).solve(start, { joints, targets }));

      expect(result.miss).toBeLessThan(2e-4);
      expect(copies).toBe(0);
      expect(start).toEqual(original);

      for (const joint of joints) {
        expect(result.q[joint.qpos]).toBeGreaterThanOrEqual(joint.range[0]);
        expect(result.q[joint.qpos]).toBeLessThanOrEqual(joint.range[1]);
      }
    } finally {
      engine.dispose();
    }
  });

  it('balances offset weight over four feet without copying pivot candidates', () => {
    const points: [number, number, number][] = [
      [-1, -1, 0],
      [1, -1, 0],
      [1, 1, 0],
      [-1, 1, 0],
    ];
    const com: [number, number, number] = [0.2, -0.3, 0.5];
    const original = structuredClone(points);
    const { result, copies } = countSlices(() => shareWeight(points, com, 120));

    expect(result.reduce((sum, force) => sum + force, 0)).toBeCloseTo(120, 3);
    expect(result.reduce((sum, force, i) => sum + force * (points[i][0] - com[0]), 0)).toBeCloseTo(0, 3);
    expect(result.reduce((sum, force, i) => sum + force * (points[i][1] - com[1]), 0)).toBeCloseTo(0, 3);
    expect(result.every((force) => force > 0)).toBe(true);
    expect(points).toEqual(original);
    expect(copies).toBe(0);
    expect(shareWeight([], com, 120)).toEqual([]);
    expect(shareWeight([[0, 0, 0]], [0, 0, 0], 120)[0]).toBeCloseTo(120, 3);
  });
});
