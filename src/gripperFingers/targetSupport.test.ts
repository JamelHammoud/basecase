import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { buildMjcf } from '../sim/mjcf';
import { SimEngine } from '../sim/engine';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { selectedPickObject } from '../cases/selectedPick';
import { worldItem } from '../cases/schema';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { endPoint } from '../cases/probes';

it('retains exact upright cylinder support before robot contact at a rotated mounting orientation', async () => {
  const mj = await loadMujoco();

  for (const source of selectedPickTargets().filter((part) => part.kind === 'cylinder' && part.rotation[0] === 0)) {
    const target = { ...source, rotation: [0, 30, 0] as [number, number, number] };
    const model = buildMjcf({
      parts: [],
      rig: buildRig([], []),
      project: DEFAULT_PROJECT,
      measures: {},
      partTriangles: () => null,
      world: [{ ...worldItem(selectedPickObject(target)), sourcePartId: target.id }],
    });
    const engine = new SimEngine(mj, model);

    try {
      engine.step(0.4);

      const at = endPoint(
        { object: target.id },
        {
          model,
          effector: null,
          basePart: null,
          basePoint: [0, 0, 0],
          objectAt: new Map([[target.id, target.position]]),
        },
        engine.poses(),
      );

      expect(
        at.distanceTo({ x: target.position[0], y: target.position[1], z: target.position[2] }),
        target.id,
      ).toBeLessThan(1);
    } finally {
      engine.dispose();
    }
  }
});
