import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { WorldItem } from './mjcfTypes';
import { emitWorld } from './mjcfWorld';

const vertices = new Float32Array([0, 0, 0, 1000, 0, 0, 0, 2000, 0, 0, 0, 3000]);
const item: WorldItem = {
  id: 'world-hull',
  name: 'Room collision',
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [4000, 5000, 6000],
  rotation: [0, 0, 0],
  dimensions: { width: 1000, height: 2000, depth: 3000 },
  color: '#aaaaaa',
  note: '',
  visible: false,
  locked: true,
  behavior: 'static',
  convexVertices: vertices,
};

function emit(world: WorldItem[]) {
  const triangles = vi.fn(() => null);
  const written = emitWorld(
    {
      parts: [],
      project: DEFAULT_PROJECT,
      rig: buildRig([], []),
      measures: {},
      partTriangles: triangles,
      worldTriangles: triangles,
      world,
    },
    0,
  );

  return { ...written, triangles };
}

describe('precomputed world collision hulls', () => {
  it('writes exact local hull vertices in metres and Z-up without measuring a hidden mesh', () => {
    const written = emit([item]);

    expect(written.assets).toHaveLength(1);
    expect(written.assets[0]).toContain('vertex="0 0 0 1 0 0 0 0 2 0 -3 0"');
    expect(written.lines.join('\n')).toContain('pos="4 -6 5"');
    expect(written.lines.join('\n')).toContain('type="mesh"');
    expect(written.lines.join('\n')).toContain('contype="0" conaffinity="1"');
    expect(written.lines.join('\n')).not.toContain('freejoint');
    expect(written.triangles).not.toHaveBeenCalled();
    expect(written.bodies[0].origin).toEqual(item.position);
    expect(item.convexVertices).toEqual(vertices);
  });

  it.each([new Float32Array(9), new Float32Array(97 * 3), new Float32Array([NaN, ...vertices])])(
    'refuses malformed or oversized supplied hulls without a primitive fallback',
    (convexVertices) => {
      expect(() => emit([{ ...item, convexVertices }])).toThrow();
    },
  );
});
