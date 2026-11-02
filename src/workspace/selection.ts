import type { ScenePart } from '../types/robotics';
import { robotOfParts, type Rig, type RobotGroup } from '../utils/kinematics';

export interface ClickOptions {
  additive: boolean;
  drill: boolean;
}

export const addIds = (prev: string[], ids: string[]) => [...prev, ...ids.filter((id) => !prev.includes(id))];

export const robotPartIds = (parts: ScenePart[], robot: RobotGroup) =>
  parts.filter((p) => robot.parts.has(p.id)).map((p) => p.id);

export const toggleIds = (prev: string[], ids: string[]) =>
  ids.every((id) => prev.includes(id)) ? prev.filter((x) => !ids.includes(x)) : addIds(prev, ids);

const insideGroup = (prev: string[], unit: string[]) =>
  unit.length > 1 && unit.some((x) => prev.includes(x)) && !unit.every((x) => prev.includes(x));

export function clickSelection(prev: string[], id: string, unit: string[], { additive, drill }: ClickOptions) {
  const target = drill || insideGroup(prev, unit) ? [id] : unit;

  return additive ? toggleIds(prev, target) : target;
}

export function poseClickSelection(rig: Rig, id: string, selectedIds: string[], parts: ScenePart[]) {
  const key = rig.robotOf.get(id);

  if (!key || key === robotOfParts(rig, selectedIds)?.key) return [id];

  const robot = rig.robots.find((r) => r.key === key);

  return robot ? robotPartIds(parts, robot) : [];
}
