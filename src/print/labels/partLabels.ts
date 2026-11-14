import { manifoldCsg } from '../../booleans/manifoldCsg';
import type { Placed } from '../../three/analysis/collide';
import type { MeshData } from '../threeMf';
import { canWrite } from './labelFont';
import type { V3 } from './labelFaces';
import { labelSolids } from './labelGlyph';
import { pickLabel, type LabelTarget } from './labelPick';

export type UnlabeledReason = 'face' | 'mesh';

export interface Unlabeled {
  id: string;
  reason: UnlabeledReason;
}

export interface LabeledMeshes {
  meshes: Map<string, MeshData>;
  unlabeled: Unlabeled[];
}

export function bedDown(matrix: number[]): V3 {
  const d: V3 = [-matrix[2], -matrix[6], -matrix[10]];
  const length = Math.hypot(...d) || 1;

  return d.map((x) => x / length) as V3;
}

export async function labelPart(
  scene: Placed[],
  target: LabelTarget,
  mesh: MeshData,
): Promise<MeshData | UnlabeledReason> {
  const pick = canWrite(target.text) ? pickLabel(scene, target, mesh) : null;

  if (!pick) return 'face';

  const cut = await manifoldCsg('subtract', [
    { positions: mesh.vertices, indices: mesh.indices },
    ...labelSolids(pick.face, pick.spot, target.text),
  ]);

  return cut ? { vertices: cut.positions, indices: cut.indices } : 'mesh';
}

export async function labelMeshes(
  scene: Placed[],
  targets: LabelTarget[],
  meshOf: (id: string) => MeshData,
): Promise<LabeledMeshes> {
  const meshes = new Map<string, MeshData>();
  const unlabeled: Unlabeled[] = [];

  for (const target of targets) {
    const made = await labelPart(scene, target, meshOf(target.id));

    if (typeof made === 'string') unlabeled.push({ id: target.id, reason: made });
    else meshes.set(target.id, made);
  }

  return { meshes, unlabeled };
}
