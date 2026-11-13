import { r3 } from '../agent/agentFrame';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { resolveJoints } from '../utils/kinematics';
import { buildRig } from '../utils/kinematicsRig';
import { selectionBounds } from '../utils/selection';
import { VIEW_AXIS, type MirrorPlane, type PlaneView } from './plane';

export interface MirrorScene {
  parts: ScenePart[];
  joints?: RobotJoint[];
  skeleton?: RobotSkeleton;
}

const middle = (parts: ScenePart[], axis: number) => {
  const { min, max } = selectionBounds(parts);

  return r3((min[axis] + max[axis]) / 2);
};

export function robotPlaneX(selected: ScenePart[], { parts, joints, skeleton }: MirrorScene): number | undefined {
  if (skeleton && selected.some((p) => p.frame)) return 0;

  if (!joints?.length) return undefined;

  const rig = buildRig(resolveJoints(joints, parts), parts);
  const key = selected.map((p) => rig.robotOf.get(p.id)).find(Boolean);
  const robot = rig.robots.find((r) => r.key === key);

  if (!robot) return undefined;

  const body = parts.filter((p) => robot.parts.has(p.id) && !rig.ownerOf.has(p.id));

  if (body.some((p) => selected.includes(p))) return undefined;

  return body.length ? middle(body, 0) : r3(robot.pivot[0]);
}

export function planeFor(view: PlaneView, selected: ScenePart[], scene: MirrorScene): MirrorPlane {
  const axis = VIEW_AXIS[view];
  const robot = axis === 0 ? robotPlaneX(selected, scene) : undefined;

  return { axis, offset: robot ?? middle(selected, axis) };
}
