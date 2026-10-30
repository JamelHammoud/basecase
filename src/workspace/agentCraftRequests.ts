import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';

interface CraftContext {
  parts: () => ScenePart[];
  viewport: () => Viewport3DHandle | null;
  setAction: (action: string) => void;
}

const MAX_MESH_BATCH = 8;

const sizeOf = (p: ScenePart) => [p.dimensions.width, p.dimensions.depth, p.dimensions.height];

function craftRow(p: ScenePart, share: number) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    share,
    printed: isPrinted(p),
    size: sizeOf(p),
    ...(p.cad
      ? {
          cad: { triangles: p.cad.indices.length / 3, volume: p.cad.volume ?? null, craft: p.cad.audit?.craft ?? null },
        }
      : {}),
    ...(p.hardware ? { hardware: { type: p.hardware.type, size: p.hardware.size } } : {}),
  };
}

export async function craftScene(ctx: CraftContext) {
  ctx.setAction('Reviewing the craft');

  const shares = (await ctx.viewport()?.visibleShares()) ?? {};

  return {
    parts: ctx
      .parts()
      .filter((p) => p.visible && p.role === 'solid')
      .map((p) => craftRow(p, shares[p.id] ?? 0)),
  };
}

export async function visibleShare(id: string, viewport: Viewport3DHandle | null) {
  const shares = (await viewport?.visibleShares()) ?? {};

  return { share: shares[id] ?? null };
}

export function partMeshes(ids: string[], parts: ScenePart[]) {
  const wanted = new Set(ids.slice(0, MAX_MESH_BATCH));
  const meshes = Object.fromEntries(
    parts
      .filter((p) => wanted.has(p.id) && p.cad)
      .map((p) => [p.id, { positions: p.cad!.positions, indices: p.cad!.indices }]),
  );

  return { meshes };
}
