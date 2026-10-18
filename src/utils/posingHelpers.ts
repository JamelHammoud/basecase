import type { ProjectSettings, RobotAnimation, RobotPoseState, TransformMode } from '../types/robotics';
import { sampleAnimation } from './animation';
import { isMovable, isRestPose, robotOfParts, withRobotPose, type Rig } from './kinematics';

export interface RobotTagged {
  robot?: string;
  values?: Record<string, number>;
  keyframes?: RobotAnimation['keyframes'];
}

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

export function robotKeyFor(rig: Rig, item: RobotTagged): string {
  if (item.robot && rig.robots.some((x) => x.key === item.robot)) return item.robot;

  const ids = Object.keys(item.values ?? item.keyframes?.[0]?.values ?? {});

  return ids.map((id) => rig.robotOf.get(id)).find(Boolean) ?? rig.robots[0]?.key ?? '';
}

export const findAnimation = (project: ProjectSettings, id: string) => project.animations?.find((a) => a.id === id);

export const animationFrame = (rig: Rig, anim: RobotAnimation, t: number, base: RobotPoseState | undefined) =>
  withRobotPose(rig, base, robotKeyFor(rig, anim), sampleAnimation(anim, t));

export const storedPose = (state: RobotPoseState) => (isRestPose(state) ? undefined : state);

export function selectionJoint(
  rig: Rig,
  selectedIds: string[],
  transformMode: TransformMode,
): string | null | undefined {
  if (transformMode !== 'pose' || !selectedIds.length) return undefined;

  if (selectedIds.length > 1) {
    const whole = robotOfParts(rig, selectedIds);

    return whole && selectedIds.length >= whole.parts.size ? null : undefined;
  }

  let at = rig.ownerOf.get(selectedIds[0]) ?? null;

  while (at && !isMovable(rig.byId.get(at)!)) at = rig.parentOf.get(at) ?? null;

  return at;
}
