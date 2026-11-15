import { describe, expect, it } from 'vitest';
import { emitWorld } from '../sim/mjcfWorld';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { caseWorldItems, importedWorldItems } from './importedWorldItems';
import type { Case } from './schema';
import { registerWorldAsset, type WorldAsset } from './worldAssets';

const positions = new Float32Array([10, 20, 30, 110, 20, 30, 10, 220, 30, 10, 20, 330]);
const hash = 'd'.repeat(64);
const asset: WorldAsset = {
  world: {
    kind: 'mesh',
    name: 'Kitchen',
    transform: { scale: 1000, quaternion: [0, 0, 0, 1], translation: [0, 0, 0] },
    mesh: {
      positions,
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array(12),
      bounds: { min: [10, 20, 30], max: [110, 220, 330] },
      groups: [],
      materials: [],
    },
  },
  pieces: [{ positions, indices: new Uint32Array([0, 1, 2]) }],
};

describe('imported world simulation items', () => {
  it('keeps hull coordinates unchanged and places hidden static pieces with the world', () => {
    registerWorldAsset(hash, asset);

    const items = importedWorldItems({ hash, position: [500, 0, -600] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      position: [500, 0, -600],
      dimensions: { width: 100, height: 200, depth: 300 },
      visible: false,
      locked: true,
      behavior: 'static',
    });
    expect(items[0].convexVertices).toBe(positions);
    expect(items[0]).not.toHaveProperty('mesh');
  });

  it('uses transported hulls without needing the visual asset in a worker', () => {
    registerWorldAsset(hash, asset);

    const transported = importedWorldItems({ hash, position: [500, 0, -600] });
    const kase: Pick<Case, 'world'> = {
      world: { objects: [], imported: { hash: 'e'.repeat(64), position: [0, 0, 0] } },
    };

    expect(caseWorldItems(kase, transported)).toEqual(transported);
    expect(() => caseWorldItems(kase)).toThrow('missing');
    expect(importedWorldItems(undefined)).toEqual([]);
  });

  it('gives all 64 collision pieces distinct MJCF geometry names and body mappings', () => {
    registerWorldAsset(hash, { ...asset, pieces: Array.from({ length: 64 }, () => asset.pieces[0]) });

    const items = importedWorldItems({ hash, position: [500, 0, -600] });
    const emitted = emitWorld(
      {
        world: items,
        parts: [],
        project: DEFAULT_PROJECT,
        rig: buildRig([], []),
        measures: {},
        partTriangles: () => null,
      },
      0,
    );
    const geomNames = [...emitted.lines.join('\n').matchAll(/<geom name="([^"]+)"/g)].map((match) => match[1]);

    expect(geomNames).toHaveLength(64);
    expect(new Set(geomNames).size).toBe(64);
    expect(new Set(emitted.bodies.map((body) => body.name)).size).toBe(64);
    expect(emitted.bodies.map((body) => body.world)).toEqual(items.map((item) => [item.id]));
    expect(emitted.bodies.every((body) => body.origin === items[0].position)).toBe(true);
  });
});
