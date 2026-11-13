import Module from 'manifold-3d';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { BooleanOp } from '../types/robotics';
import type { WeldedMesh } from './csg';

let loading: Promise<ManifoldToplevel | null> | null = null;

const inBrowser = () => typeof location !== 'undefined' && location.protocol !== 'file:';

function loadManifold(): Promise<ManifoldToplevel | null> {
  loading ??= Module(inBrowser() ? { locateFile: () => wasmUrl } : undefined)
    .then((wasm) => {
      wasm.setup();

      return wasm;
    })
    .catch(() => null);

  return loading;
}

function solidOf(wasm: ManifoldToplevel, mesh: WeldedMesh): Manifold | null {
  try {
    const input = new wasm.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices });

    input.merge();

    const solid = new wasm.Manifold(input);

    if (solid.status() === 'NoError' && !solid.isEmpty()) return solid;

    solid.delete();

    return null;
  } catch {
    return null;
  }
}

function combine(wasm: ManifoldToplevel, op: BooleanOp, solids: Manifold[]): Manifold {
  if (op === 'union') return wasm.Manifold.union(solids);

  if (op === 'intersect') return wasm.Manifold.intersection(solids);

  const tools = wasm.Manifold.union(solids.slice(1));
  const result = solids[0].subtract(tools);

  tools.delete();

  return result;
}

export async function manifoldCsg(op: BooleanOp, operands: WeldedMesh[]): Promise<WeldedMesh | null> {
  const wasm = await loadManifold();

  if (!wasm) return null;

  const solids = operands.map((m) => solidOf(wasm, m));
  const made = solids.filter((s): s is Manifold => !!s);

  if (made.length !== solids.length) {
    made.forEach((s) => s.delete());

    return null;
  }

  const result = combine(wasm, op, made);
  const mesh = result.getMesh();
  const out = { positions: Float32Array.from(mesh.vertProperties), indices: Uint32Array.from(mesh.triVerts) };

  result.delete();
  made.forEach((s) => s.delete());

  return out;
}
