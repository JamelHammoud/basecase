import { booleanPart, type BooleanPart } from '../../booleans/parts';
import type { ScenePart } from '../../types/robotics';
import type { MergeGroup } from './mergeTypes';

export interface MergeDraft {
  draft: BooleanPart;
  base: ScenePart;
  tools: ScenePart[];
}

export function mergeDraft(parts: ScenePart[], group: MergeGroup, newId: () => string): MergeDraft | null {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const members = group.ids.map((id) => byId.get(id));

  if (members.some((p) => !p) || group.hardware.some((id) => !byId.has(id))) return null;

  const [base, ...tools] = members as ScenePart[];

  return { draft: booleanPart({ id: base.id, base: { ...base, id: newId() }, tools, op: 'union' }), base, tools };
}

export function mergedParts(prev: ScenePart[], group: MergeGroup, result: ScenePart): ScenePart[] {
  const gone = new Set([...group.ids.filter((id) => id !== group.keep), ...group.hardware]);

  return prev.filter((p) => !gone.has(p.id)).map((p) => (p.id === group.keep ? result : p));
}

export const sameMembers = (group: MergeGroup, ids: string[]) =>
  group.ids.length === ids.length && group.ids.every((id) => ids.includes(id));
