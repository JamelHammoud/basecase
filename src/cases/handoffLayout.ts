import type { V3 } from '../utils/kinematics';
import type { BuilderRobot, GoalValues } from './caseGoals';
import type { SlotPose } from './schema';
import { handoffReachable } from './handoffReach';

const CLEARANCE_MM = 12;
const MIN_SIZE_MM = 10;
const MAX_SIZE_MM = 80;
const MAX_LENGTH_MM = 400;

export interface HandoffLayout {
  size: V3;
  block: V3;
  spot: V3;
  donor: V3;
  recipient: V3;
  gripY: number;
  hoverY: number;
  gap: number;
  anchor: V3;
  pose: SlotPose;
}

export function handoffLayout(robot: BuilderRobot, v: Pick<GoalValues, 'distanceMm' | 'heightMm'>): HandoffLayout {
  const partner = robot.partner ?? robot;
  const a = robot.facts.gripper;
  const b = partner.facts.gripper;
  const width = Math.min(MAX_SIZE_MM, Math.max(MIN_SIZE_MM, Math.min(a?.openingMm ?? 0, b?.openingMm ?? 0) * 0.7));
  const depth = Math.max(a?.depthMm ?? 0, b?.depthMm ?? 0);
  const gap = (a?.depthMm ?? 0) + (b?.depthMm ?? 0) + width + CLEARANCE_MM;
  const [x, , z] = robot.facts.anchor;
  const transferZ = z + v.distanceMm;
  const pickupZ = transferZ - width;
  const placeZ = transferZ + width;
  const anchor: V3 = [x, partner.facts.anchor[1], z + v.distanceMm * 2];
  const own = partner.facts.anchor;
  const pivot = partner.pivot;

  return {
    size: [width, width, gap + width],
    block: [x, width / 2, pickupZ],
    spot: [x, width / 2, placeZ],
    donor: [x, v.heightMm, transferZ - gap / 2],
    recipient: [x, v.heightMm, transferZ + gap / 2],
    gripY: Math.max(width / 2, depth + 4),
    hoverY: Math.max(v.heightMm, width * 2 + depth),
    gap,
    anchor,
    pose: { position: [anchor[0] + own[0] - pivot[0], pivot[1], anchor[2] + own[2] - pivot[2]], yawDeg: 180 },
  };
}

const away = (a: V3, b: V3) => Math.hypot(...a.map((x, i) => x - b[i]));
const perpendicular = (a: V3, b: V3) => Math.abs(a.reduce((sum, x, i) => sum + x * b[i], 0)) < 0.15;

export function handoffProblem(robot: BuilderRobot, v: GoalValues): string | null {
  const partner = robot.partner;
  const a = robot.facts.gripper;
  const b = partner?.facts.gripper;

  if (!a || !b) return 'Open two arms with grippers.';

  const layout = handoffLayout(robot, v);
  const width = layout.size[0];

  if (
    Math.min(a.openingMm, b.openingMm) <= width ||
    Math.max(a.closedOpeningMm, b.closedOpeningMm) >= width ||
    Math.min(a.depthMm, b.depthMm) <= 0 ||
    layout.size[2] > MAX_LENGTH_MM ||
    !perpendicular(a.approach, a.across) ||
    !perpendicular(b.approach, b.across)
  )
    return 'Choose grippers with room for separate grasps on the block.';

  if (v.heightMm < layout.gripY + width) return 'Raise the transfer above the block.';

  const donorPick: V3 = [layout.block[0], layout.gripY, layout.block[2] - layout.gap / 2];
  const recipientPlace: V3 = [layout.spot[0], layout.gripY, layout.spot[2] + layout.gap / 2];
  const reachable =
    Math.max(away(layout.donor, robot.facts.anchor), away(donorPick, robot.facts.anchor)) < robot.facts.reachMm * 0.9 &&
    Math.max(away(layout.recipient, layout.anchor), away(recipientPlace, layout.anchor)) < partner.facts.reachMm * 0.9;

  return reachable && handoffReachable(robot, layout) ? null : 'Bring the transfer within reach of both grippers.';
}
