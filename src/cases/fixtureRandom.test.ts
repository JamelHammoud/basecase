import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { startEngine } from './runCase';

it('draws repeatable passive resistance and springs without changing the nominal model or robot control width', async () => {
  const model = buildMjcf({
    parts: [],
    rig: buildRig([], []),
    project: DEFAULT_PROJECT,
    measures: {},
    partTriangles: () => null,
    world: [
      {
        id: 'spring',
        name: 'Spring',
        kind: 'box',
        category: 'structure',
        role: 'solid',
        position: [0, 30, 0],
        rotation: [0, 0, 0],
        dimensions: { width: 20, height: 20, depth: 20 },
        color: '#909090',
        note: '',
        visible: true,
        locked: true,
        behavior: 'dynamic',
        massG: 10,
        joint: {
          type: 'prismatic',
          origin: [0, 30, 0],
          axis: [0, 1, 0],
          range: [0, 10],
          damping: 0.1,
          frictionloss: 0.2,
          stiffness: 3,
          springref: 5,
        },
      },
    ],
  });
  const mj = await loadMujoco();
  const original = new SimEngine(mj, model);
  const a = startEngine(mj, model, { controller: { kind: 'limp' }, seed: 17 });
  const b = startEngine(mj, model, { controller: { kind: 'limp' }, seed: 17 });
  const c = startEngine(mj, model, { controller: { kind: 'limp' }, seed: 18 });
  const values = (engine: SimEngine) => [
    engine.model.dof_damping[0],
    engine.model.dof_frictionloss[0],
    engine.model.jnt_stiffness[0],
  ];

  try {
    expect(values(a.engine)).toEqual(values(b.engine));
    expect(values(a.engine)).not.toEqual(values(c.engine));
    expect(values(original)).toEqual([0.1, 0.2, 3]);
    expect(a.engine.model.nu).toBe(0);
    expect(a.engine.model.qpos_spring[0]).toBeCloseTo(0.005, 12);
    expect(
      values(a.engine).every((value, i) => value >= values(original)[i] * 0.8 && value <= values(original)[i] * 1.2),
    ).toBe(true);
  } finally {
    original.dispose();
    a.dispose();
    b.dispose();
    c.dispose();
  }
});
