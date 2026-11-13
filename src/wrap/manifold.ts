import Module, { type Box, type Manifold, type ManifoldToplevel, type Vec3 } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

export type ManifoldApi = ManifoldToplevel;
export type Solid = Manifold;

const inBrowser = typeof document !== 'undefined' || 'importScripts' in globalThis;

let loading: Promise<ManifoldApi> | null = null;

export function loadManifold(): Promise<ManifoldApi> {
  loading ??= Module(inBrowser ? { locateFile: () => wasmUrl } : undefined).then((api) => {
    api.setup();

    return api;
  });

  return loading;
}

export interface IndexedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

function exactSolid(api: ManifoldApi, mesh: IndexedMesh): Solid | null {
  try {
    const solid = new api.Manifold(
      new api.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
    );

    if (!solid.isEmpty()) return solid;

    solid.delete();

    return null;
  } catch {
    return null;
  }
}

function flipped(indices: Uint32Array): Uint32Array {
  const out = indices.slice();

  for (let t = 0; t + 2 < out.length; t += 3) [out[t + 1], out[t + 2]] = [out[t + 2], out[t + 1]];

  return out;
}

export function solidOfMesh(api: ManifoldApi, mesh: IndexedMesh): Solid | null {
  if (!mesh.indices.length) return null;

  const solid = exactSolid(api, mesh);

  if (!solid || solid.volume() > 0) return solid;

  solid.delete();

  return exactSolid(api, { positions: mesh.positions, indices: flipped(mesh.indices) });
}

export function meshOfSolid(solid: Solid): IndexedMesh {
  const mesh = solid.getMesh();
  const positions = new Float32Array(mesh.numVert * 3);

  for (let v = 0; v < mesh.numVert; v++) {
    positions[v * 3] = mesh.vertProperties[v * mesh.numProp];
    positions[v * 3 + 1] = mesh.vertProperties[v * mesh.numProp + 1];
    positions[v * 3 + 2] = mesh.vertProperties[v * mesh.numProp + 2];
  }

  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

export function soupOfMesh({ positions, indices }: IndexedMesh): Float32Array {
  const soup = new Float32Array(indices.length * 3);

  for (let i = 0; i < indices.length; i++) {
    soup[i * 3] = positions[indices[i] * 3];
    soup[i * 3 + 1] = positions[indices[i] * 3 + 1];
    soup[i * 3 + 2] = positions[indices[i] * 3 + 2];
  }

  return soup;
}

export interface LevelSet {
  sdf: (p: Vec3) => number;
  box: Box;
  edge: number;
  tolerance: number;
}

export function levelSetSolid(api: ManifoldApi, { sdf, box, edge, tolerance }: LevelSet): Solid | null {
  const made = api.Manifold.levelSet(sdf, box, edge, 0, tolerance);

  if (!made.isEmpty()) return made;

  made.delete();

  return null;
}
