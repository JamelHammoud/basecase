import { weld } from '../print/threeMf';
import { levelSetSolid, solidOfMesh, type ManifoldApi, type Solid } from './manifold';
import { SolidField, type V3 } from './solidField';

const SIMPLIFY_MM = 0.1;

function insetSolid(api: ManifoldApi, field: SolidField, inset: number, edge: number): Solid | null {
  const cap = inset + edge * 3;
  const pad = edge * 2;
  const { min, max } = field.box;
  const box = {
    min: [min.x - pad, min.y - pad, min.z - pad] as V3,
    max: [max.x + pad, max.y + pad, max.z + pad] as V3,
  };
  const made = levelSetSolid(api, { sdf: (p) => field.depth(p, cap) - inset, box, edge, tolerance: -1 });
  const simple = made?.simplify(SIMPLIFY_MM) ?? null;

  made?.delete();

  return simple;
}

export function hollowOf(api: ManifoldApi, soup: Float32Array, opts: { wallMm: number; edgeMm: number }): Solid | null {
  const welded = weld(soup);
  const field = new SolidField(soup);

  try {
    const outer =
      solidOfMesh(api, { positions: welded.vertices, indices: welded.indices }) ??
      insetSolid(api, field, 0, opts.edgeMm);
    const inner = outer && insetSolid(api, field, opts.wallMm, opts.edgeMm);

    if (!outer || !inner) return outer;

    const shell = outer.subtract(inner);

    outer.delete();
    inner.delete();

    return shell;
  } finally {
    field.dispose();
  }
}
