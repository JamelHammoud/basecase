import { solveIK, type V3 } from '../utils/kinematics';
import { restSide, sideFor, topDownTargets } from '../sim/driveGrip';
import type { BuilderRobot } from './caseGoals';
import type { HandoffLayout } from './handoffLayout';

const REACH_TOLERANCE_MM = 2;

function reaches(robot: BuilderRobot, targets: V3[], transfer: V3): boolean {
  const { rig, facts } = robot;
  const effector = facts.endEffector;
  const grip = facts.gripper;

  if (!rig || !effector || !grip) return false;

  const { part, point } = effector;
  const options = { joints: facts.armJoints, iterations: 80, tolerance: 0.5 };
  const reach = (target: V3) => ({ partId: part, point, target });
  const positions = targets.every((target) => solveIK(rig, {}, [reach(target)], options).maxError < REACH_TOLERANCE_MM);

  if (!positions) return false;

  const side = sideFor(transfer, facts.anchor, restSide(grip));
  const pose = solveIK(rig, {}, [reach(transfer)], options).values;
  const goals = [reach(transfer), ...topDownTargets({ grip, part, point, goal: transfer, side })];

  return solveIK(rig, pose, goals, options).maxError < REACH_TOLERANCE_MM;
}

export function handoffReachable(robot: BuilderRobot, layout: HandoffLayout): boolean {
  const partner = robot.partner;

  if (!partner) return false;

  const { block, spot, gripY, gap, donor, recipient, anchor } = layout;
  const own = partner.facts.anchor;
  const unplaced = (at: V3): V3 => [own[0] - (at[0] - anchor[0]), at[1], own[2] - (at[2] - anchor[2])];
  const pick: V3 = [block[0], gripY, block[2] - gap / 2];
  const place: V3 = [spot[0], gripY, spot[2] + gap / 2];

  const receive = unplaced(recipient);

  return reaches(robot, [pick, donor], donor) && reaches(partner, [receive, unplaced(place)], receive);
}
