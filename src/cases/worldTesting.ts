import type { Decompose, WorldMesh } from './worldCollider';
import { worldBounds, worldPieces } from './worldCollider';
import type { FixtureMesh } from './worldFixtures';
import { vhacdDecompose } from './worldVhacd';
import type { MeshWorld } from './worldTypes';

let decomposer: Promise<Decompose> | null = null;

export const testDecompose = () => (decomposer ??= vhacdDecompose());

export function sceneMesh(m: FixtureMesh): WorldMesh {
  let floor = Infinity;

  for (let i = 1; i < m.positions.length; i += 3) floor = Math.min(floor, m.positions[i]);

  return {
    positions: Float32Array.from(m.positions, (v, i) => (i % 3 === 1 ? v - floor : v) * 1000),
    indices: Uint32Array.from(m.indices),
  };
}

const worlds = new Map<string, Promise<MeshWorld>>();

async function decomposed(m: FixtureMesh, name: string): Promise<MeshWorld> {
  const mesh = sceneMesh(m);

  return {
    hash: name
      .toLowerCase()
      .padEnd(64, '0')
      .replace(/[^0-9a-f]/g, '0')
      .slice(0, 64),
    name,
    pieces: worldPieces(mesh, await testDecompose()),
    bounds: worldBounds(mesh.positions),
  };
}

export function fixtureWorld(m: FixtureMesh, name: string): Promise<MeshWorld> {
  const known = worlds.get(name);

  if (known) return known;

  const next = decomposed(m, name);

  worlds.set(name, next);

  return next;
}
