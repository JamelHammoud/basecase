import type { SimJoint } from '../sim/mjcfTypes';

export function jointIndices(all: readonly SimJoint[], selected: readonly SimJoint[]): number[] {
  if (!selected.length) return [];

  const first = new Map<SimJoint, number>();

  all.forEach((joint, i) => {
    if (!first.has(joint)) first.set(joint, i);
  });

  return selected.map((joint) => first.get(joint) ?? -1);
}
