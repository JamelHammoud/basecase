import { solveIK, type V3 } from '../utils/kinematics';
import type { BuilderRobot } from './caseGoals';
import type { HandoffLayout } from './handoffLayout';

const REACH_TOLERANCE_MM = 2;

function reaches(robot: BuilderRobot, targets: V3[]): boolean {
  const { rig, facts } = robot;
  const effector = facts.endEffector;

  if (!rig || !effector) return false;

  return targets.every(
    (target) =>
      solveIK(rig, {}, [{ partId: effector.part, point: effector.point, target }], {
        joints: facts.armJoints,
        iterations: 80,
        tolerance: 0.5,
      }).maxError < REACH_TOLERANCE_MM,
  );
}

export function handoffReachable(robot: BuilderRobot, layout: HandoffLayout): boolean {
  const partner = robot.partner;

  if (!partner) return false;

  const { block, spot, gripY, gap, donor, recipient, anchor } = layout;
  const own = partner.facts.anchor;
  const unplaced = (at: V3): V3 => [own[0] - (at[0] - anchor[0]), at[1], own[2] - (at[2] - anchor[2])];
  const pick: V3 = [block[0], gripY, block[2] - gap / 2];
  const place: V3 = [spot[0], gripY, spot[2] + gap / 2];

  return reaches(robot, [pick, donor]) && reaches(partner, [unplaced(recipient), unplaced(place)]);
}
