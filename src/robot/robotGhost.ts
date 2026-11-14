import type * as THREE from 'three';
import type { RobotPoseState } from '../types/robotics';
import { forwardKinematics, poseDeltas, posedAxis, type Rig, type V3 } from '../utils/kinematics';
import type { RobotTwin } from './robotTwin';
import { radiansToDegrees as degrees, signedAngleReading } from '../utils/angle';

export interface GhostLabel {
  text: string;
  at: V3;
}

export interface RobotGhost {
  parts: string[];
  deltas: Map<string, THREE.Matrix4>;
  values: Record<string, number>;
  label: GhostLabel | null;
}

function measuredPose(rig: Rig, twin: Pick<RobotTwin, 'joints' | 'measured'>): RobotPoseState {
  const values: Record<string, number> = {};

  twin.joints.forEach((id, k) => {
    const radians = twin.measured[k];

    if (radians !== null && rig.byId.get(id)?.type === 'revolute') values[id] = degrees(radians);
  });

  return { values };
}

function ghostParts(rig: Rig, partIds: readonly string[], joints: readonly string[]): string[] {
  const robot = joints.map((id) => rig.robotOf.get(id)).find(Boolean);

  return partIds.filter((id) => rig.ownerOf.has(id) && rig.robotOf.get(id) === robot);
}

function labelOf(rig: Rig, pose: RobotPoseState, largest: RobotTwin['largest']): GhostLabel | null {
  const joint = largest && rig.byId.get(largest.joint);

  if (!largest || !joint) return null;

  const { origin } = posedAxis(rig, forwardKinematics(rig, pose), joint);

  return { text: signedAngleReading(degrees(largest.gap)), at: [origin.x, origin.y, origin.z] };
}

export function robotGhost(
  rig: Rig,
  partIds: readonly string[],
  twin: Pick<RobotTwin, 'joints' | 'measured' | 'largest'>,
): RobotGhost {
  const parts = ghostParts(rig, partIds, twin.joints);
  const pose = measuredPose(rig, twin);

  return {
    parts,
    deltas: poseDeltas(rig, pose, parts),
    values: pose.values,
    label: labelOf(rig, pose, twin.largest),
  };
}
