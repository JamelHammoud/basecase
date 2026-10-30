import type { RobotJoint, ScenePart } from '../types/robotics';
import { resolveJoints } from '../utils/kinematics';
import type { ChainResult } from './assemblyTypes';
import { knownClamps, rememberClamps } from './clampCache';
import { isFastenerPart } from './fastenerSpec';
import { clampsOf, withFastenerFollowers } from './followers';

export const rigJoints = (joints: RobotJoint[], parts: ScenePart[]): RobotJoint[] =>
  withFastenerFollowers(resolveJoints(joints, parts), knownClamps(parts));

export function jointsWithChains(joints: RobotJoint[], parts: ScenePart[], chains: ChainResult | null | undefined) {
  if (!chains) return rigJoints(joints, parts);

  const clamps = clampsOf(chains);

  rememberClamps(parts, clamps);

  return withFastenerFollowers(resolveJoints(joints, parts), clamps);
}

export function needsClamps(joints: RobotJoint[] | undefined, parts: ScenePart[]): boolean {
  if (!joints?.length) return false;

  const listed = new Set(joints.flatMap((j) => [...j.child, ...j.parent]));
  const known = knownClamps(parts);

  return parts.some((p) => isFastenerPart(p) && !listed.has(p.id) && !known[p.id]);
}
