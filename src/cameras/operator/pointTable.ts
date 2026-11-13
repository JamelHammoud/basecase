import { pointKey, type PointTable } from '../../sim/inputTypes';
import type { PointOf } from '../../utils/animationGoals';
import type { Rig } from '../../utils/kinematics';

const WHERE = ['bottom', 'center'] as const;

export function pointTable(rig: Rig, pointOf: PointOf, robot?: string): PointTable {
  const ids = [...rig.joints.map((j) => j.id), ...rig.ownerOf.keys()];
  const table: PointTable = {};

  for (const id of new Set(ids)) {
    if (robot && rig.robotOf.get(id) !== robot) continue;

    for (const where of WHERE) {
      const p = pointOf(id, where);

      if (p) table[pointKey(id, where)] = [p[0], p[1], p[2]];
    }
  }

  return table;
}

export const pointOfTable =
  (table: PointTable): PointOf =>
  (id, where) =>
    table[pointKey(id, where)] ?? null;
