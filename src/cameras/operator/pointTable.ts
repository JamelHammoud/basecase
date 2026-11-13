import type { PointOf } from '../../utils/animationGoals';
import type { Rig, V3 } from '../../utils/kinematics';
import { autoMapRobot } from '../../utils/mocapBones';
import { robotLandmarks } from '../../utils/retargetRobot';

export type PointTable = Record<string, V3 | null>;

const keyOf = (id: string, where: 'bottom' | 'center') => `${where}:${id}`;

export function tabulatePoints(rig: Rig, pointOf: PointOf): PointTable {
  const table: PointTable = {};
  const recording: PointOf = (id, where) => {
    const p = pointOf(id, where);

    table[keyOf(id, where)] = p;

    return p;
  };

  robotLandmarks({ rig, pointOf: recording, joints: autoMapRobot(rig) });

  return table;
}

export const pointsFrom =
  (table: PointTable): PointOf =>
  (id, where) =>
    table[keyOf(id, where)] ?? null;
