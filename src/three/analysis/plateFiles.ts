import { bedDown, labelMeshes, type Unlabeled } from '../../print/labels/partLabels';
import type { LabelTarget } from '../../print/labels/labelPick';
import { weld, writeThreeMf, type MeshData } from '../../print/threeMf';
import type { Placed } from './collide';
import type { ShapeSolid } from './shapeSolid';

export interface ThreeMfFileSpec {
  key: string;
  plates: Array<{ number: number; name: string }>;
  items: Array<{ id: string; name: string; matrix: number[]; plate: number }>;
}

export interface ThreeMfTask {
  instances: Array<{ id: string; key: string; matrix: number[] }>;
  files: ThreeMfFileSpec[];
  plateSize: [number, number];
  labels?: Record<string, string>;
}

export type PlateFilesInput = Omit<ThreeMfTask, 'instances'>;

export interface ThreeMfResult {
  files: Record<string, Uint8Array>;
  unlabeled: Unlabeled[];
}

interface PlateContext {
  solidOf: (key: string) => ShapeSolid;
  placeAll: () => Placed[];
}

function labelTargets(task: ThreeMfTask, known: Set<string>): LabelTarget[] {
  const firstItem = new Map<string, number[]>();

  for (const item of task.files.flatMap((f) => f.items))
    if (known.has(item.id) && task.labels?.[item.id] && !firstItem.has(item.id)) firstItem.set(item.id, item.matrix);

  return [...firstItem.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, matrix]) => ({ id, text: task.labels![id], down: bedDown(matrix) }));
}

export async function plateFiles(task: ThreeMfTask, ctx: PlateContext): Promise<ThreeMfResult> {
  const keyOf = new Map(task.instances.map((i) => [i.id, i.key]));
  const welded = new Map<string, MeshData>();
  const shapeMesh = (id: string) => {
    const key = keyOf.get(id)!;

    return welded.get(key) ?? welded.set(key, weld(ctx.solidOf(key).positions)).get(key)!;
  };
  const targets = task.labels ? labelTargets(task, new Set(keyOf.keys())) : [];
  const labeled = targets.length ? await labelMeshes(ctx.placeAll(), targets, shapeMesh) : null;
  const meshOf = (id: string) => labeled?.meshes.get(id) ?? shapeMesh(id);
  const files = Object.fromEntries(
    task.files.map((file) => {
      const usable = file.items.filter((it) => keyOf.has(it.id));
      const objects = usable.map((it, i) => ({ id: i + 1, name: it.name, mesh: meshOf(it.id) }));
      const items = usable.map((it, i) => ({ objectId: i + 1, matrix: it.matrix, plate: it.plate }));

      return [
        file.key,
        writeThreeMf({ layout: 'grid', plateSize: task.plateSize, plates: file.plates, objects, items }),
      ];
    }),
  );

  return { files, unlabeled: labeled?.unlabeled ?? [] };
}
