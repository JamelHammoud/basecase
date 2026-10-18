import type { ScenePart } from '../types/robotics';
import { robotOfParts, type Rig, type RobotGroup } from '../utils/kinematics';

export interface ClickOptions {
  additive: boolean;
  drill: boolean;
}

export const addIds = (prev: string[], ids: string[]) => [...prev, ...ids.filter((id) => !prev.includes(id))];

export const robotPartIds = (parts: ScenePart[], robot: RobotGroup) =>
  parts.filter((p) => robot.parts.has(p.id)).map((p) => p.id);

export function clickSelection(prev: string[], id: string, unit: string[], { additive, drill }: ClickOptions) {
  if (additive) {
    return prev.includes(id) ? prev.filter((x) => !unit.includes(x)) : addIds(prev, unit);
  }

  if (drill) return [id];

  const insideGroup =
    unit.length > 1 && prev.length > 0 && prev.length < unit.length && prev.every((x) => unit.includes(x));

  return insideGroup ? [id] : unit;
}

export function poseClickSelection(rig: Rig, id: string, selectedIds: string[], parts: ScenePart[]) {
  const key = rig.robotOf.get(id);

  if (!key || key === robotOfParts(rig, selectedIds)?.key) return [id];

  const robot = rig.robots.find((r) => r.key === key);

  return robot ? robotPartIds(parts, robot) : [];
}
