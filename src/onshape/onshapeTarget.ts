import type { RobotJoint, ScenePart } from '../types/robotics';
import type { PartGroup } from '../types/robotLink';
import type { ImportedRobot } from '../utils/robotImport';
import { onshapeLinkOf } from './onshapeLink';
import { isOnshapePart, planOnshapeUpdate, type OnshapeUpdate } from './onshapeUpdate';

export interface OnshapeTarget {
  group: PartGroup;
  link: string;
}

function targetsIn(parts: ScenePart[]): OnshapeTarget[] {
  const out = new Map<string, OnshapeTarget>();

  for (const p of parts) {
    const link = p.group && !out.has(p.group.id) && isOnshapePart(p, p.group.id) && onshapeLinkOf(p.group.onshape);

    if (link) out.set(p.group!.id, { group: p.group!, link });
  }

  return [...out.values()];
}

export function selectedTarget(parts: ScenePart[], selectedIds: string[]): OnshapeTarget | null {
  const chosen = new Set(selectedIds);
  const selected = targetsIn(parts.filter((p) => chosen.has(p.id)));

  return selected.length === 1 ? selected[0] : null;
}

export function onshapeTarget(parts: ScenePart[], selectedIds: string[]): OnshapeTarget | null {
  const chosen = new Set(selectedIds);

  if (targetsIn(parts.filter((p) => chosen.has(p.id))).length) return selectedTarget(parts, selectedIds);

  const all = targetsIn(parts);

  return all.length === 1 ? all[0] : null;
}

export const partTarget = (parts: ScenePart[], part: ScenePart) =>
  part.group ? (targetsIn(parts.filter((p) => p.group?.id === part.group!.id))[0] ?? null) : null;

export interface UpdateRequest {
  groupId: string;
  current: () => { parts: ScenePart[]; joints: RobotJoint[] };
  load: (link: string) => Promise<ImportedRobot>;
}

export async function fetchOnshapeUpdate({ groupId, current, load }: UpdateRequest): Promise<OnshapeUpdate | null> {
  const target = targetsIn(current().parts.filter((p) => p.group?.id === groupId))[0];

  if (!target) return null;

  const fresh = await load(target.link);

  return planOnshapeUpdate({ ...current(), groupId, fresh });
}
