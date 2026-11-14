import type { ScenePart } from '../types/robotics';
import { robotOfParts, type Rig, type RobotGroup } from '../utils/kinematics';

export interface ClickOptions {
  additive: boolean;
  drill: boolean;
}

export function addIds(prev: string[], ids: string[]) {
  const selected = new Set(prev);

  return [...prev, ...ids.filter((id) => !selected.has(id))];
}

export const robotPartIds = (parts: ScenePart[], robot: RobotGroup) =>
  parts.filter((p) => robot.parts.has(p.id)).map((p) => p.id);

export function toggleIds(prev: string[], ids: string[]) {
  const selected = new Set(prev);

  if (!ids.every((id) => selected.has(id))) return addIds(prev, ids);

  const removed = new Set(ids);

  return prev.filter((id) => !removed.has(id));
}

function insideGroup(prev: string[], unit: string[]) {
  if (unit.length < 2) return false;

  const selected = new Set(prev);

  return unit.some((id) => selected.has(id)) && !unit.every((id) => selected.has(id));
}

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
