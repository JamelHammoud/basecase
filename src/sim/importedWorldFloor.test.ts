import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobot } from '../skills/fixtureModels';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from './engine';
import { box, fixtureMeasures, fixtureTriangles } from './fixtures/parts';
import { buildMjcf } from './mjcf';
import type { SimModel, WorldItem } from './mjcfTypes';

function floorPiece(id: string, left: number): WorldItem {
  const vertices = [0, 1].flatMap((x) =>
    [0, 1].flatMap((y) => [0, 1].flatMap((z) => [left + x * 1500, -20 + y * 20, -2000 + z * 4000])),
  );

  return {
    ...box(id, [0, 0, 0], [1500, 20, 4000], 1),
    behavior: 'static',
    visible: false,
    convexVertices: new Float32Array(vertices),
  };
}

function model(world: WorldItem[]): SimModel {
  const rover = fixtureRobot('rover-diff');

  return buildMjcf({
    parts: rover.parts,
    rig: buildRig(rover.joints, rover.parts),
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(rover.parts),
    partTriangles: fixtureTriangles(rover.parts),
    world,
  });
}

const floor = '<geom name="floor" type="plane"';

describe('imported world floors', () => {
  it('uses imported static hulls as the only floor while retaining ordinary Case floors', () => {
    const imported = floorPiece('imported-left', -2000);
    const ordinary = { ...imported, convexVertices: undefined };

    expect(model([imported]).xml).not.toContain(floor);
    expect(model([]).xml).toContain(floor);
    expect(model([ordinary]).xml).toContain(floor);
    expect(model([{ ...imported, behavior: 'dynamic' }]).xml).toContain(floor);
    expect(model([{ ...imported, behavior: 'marker' }]).xml).toContain(floor);
  });

  it('lets a rover fall through the imported floor gap instead of resting on an invisible plane', async () => {
    const mj = await loadMujoco();
    const heights = [[], [floorPiece('left', -2000), floorPiece('right', 500)]].map((world) => {
      const engine = new SimEngine(mj, model(world));

      try {
        engine.setController({ kind: 'hold' });
        engine.step(0.5);

        return engine.stats().robots[0].height;
      } finally {
        engine.dispose();
      }
    });

    expect(heights[0]).toBeGreaterThan(-0.05);
    expect(heights[1]).toBeLessThan(-0.5);
  });
});
