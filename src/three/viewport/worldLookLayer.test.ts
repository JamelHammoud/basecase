import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { StoredWorld } from '../../cases/worldTypes';
import { WORLD_LOOK } from '../worldLook';
import { WorldLookLayer } from './worldLookLayer';

const OBJ = new TextEncoder().encode(['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n'));

const stored = (hash: string): StoredWorld => ({
  hash,
  name: hash,
  pieces: [],
  bounds: { min: [0, 0], max: [1, 1] },
  files: [{ name: 'room.obj', bytes: OBJ }],
  look: { mesh: { file: 'room.obj', format: 'obj' } },
  frame: { mmPerUnit: 1000, liftMm: 0 },
});

function layer() {
  const parent = new THREE.Group();
  const loads: string[] = [];
  let draws = 0;
  const world = new WorldLookLayer(parent, {
    renderer: {} as THREE.WebGLRenderer,
    redraw: () => draws++,
    invalidate: () => draws++,
    load: async (hash) => {
      loads.push(hash);

      return hash === 'missing' ? null : stored(hash);
    },
  });
  const looks = () => parent.children.filter((c) => c.name === WORLD_LOOK);

  return { world, looks, loads, draws: () => draws };
}

describe('WorldLookLayer', () => {
  it('shows the world under its parent, moves it without loading it again, and removes it', async () => {
    const { world, looks, loads, draws } = layer();

    await world.set({ hash: 'a', name: 'A', at: [0, 0, 0] });

    expect(world.kind).toBe('mesh');
    expect(looks().map((l) => l.userData.world)).toEqual(['a']);
    expect(draws()).toBeGreaterThan(0);

    await world.set({ hash: 'a', name: 'A', at: [500, 0, 0] });

    expect(looks()[0].position.x).toBe(500);
    expect(loads).toEqual(['a']);

    await world.set(null);

    expect(world.kind).toBeNull();
    expect(looks()).toEqual([]);
  });

  it('keeps only the newest world when two arrive at once, and nothing for one it can’t find', async () => {
    const { world, looks } = layer();
    const first = world.set({ hash: 'a', name: 'A', at: [0, 0, 0] });

    await world.set({ hash: 'b', name: 'B', at: [0, 0, 0] });
    await first;

    expect(looks().map((l) => l.userData.world)).toEqual(['b']);

    await world.set({ hash: 'missing', name: 'Gone', at: [0, 0, 0] });

    expect(world.kind).toBeNull();
    expect(looks()).toEqual([]);
  });
});
