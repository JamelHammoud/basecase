import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { sheetPart } from '../sheet/sheet.fixtures';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { WorldItem } from './mjcfTypes';
import { emitWorld } from './mjcfWorld';

describe('transformed sheets in an MJCF world', () => {
  it('uses the transformed hull instead of the original primitive dimensions', () => {
    const item: WorldItem = {
      ...sheetPart({ sheetTransform: new Matrix4().makeScale(1, 1, 2).toArray() }),
      behavior: 'static',
    };
    const group = buildPartGroup(item, false);
    const triangles = localTriangles(group);

    releasePartGroup(group);

    const world = emitWorld(
      {
        parts: [],
        project: DEFAULT_PROJECT,
        rig: buildRig([], []),
        measures: {},
        partTriangles: () => null,
        world: [item],
        worldTriangles: () => triangles,
      },
      0,
    );

    expect(world.assets).toHaveLength(1);
    expect(world.lines.join('\n')).toContain('type="mesh"');

    const vertices = /vertex="([^"]+)"/.exec(world.assets[0])![1].split(' ').map(Number);
    const bounds = new Box3().setFromArray(vertices).getSize(new Vector3());

    expect(bounds.toArray()).toEqual([0.08, 0.006, 0.06]);
  });
});
