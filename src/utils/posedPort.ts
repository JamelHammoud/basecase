import * as THREE from 'three';
import type { V3 } from '../agent/agentFrame';
import { findPort, worldPort } from '../agent/ports';
import type { RobotPoseState, ScenePart } from '../types/robotics';
import { forwardKinematics, partMotion } from './kinematicsMotion';
import type { Rig } from './kinematicsRig';

export function posedPort(
  rig: Rig,
  pose: RobotPoseState | null | undefined,
  at: { part: ScenePart; port: string },
): V3 | null {
  const port = findPort(at.part, at.port);

  if (!port) return null;

  const point = new THREE.Vector3(...worldPort(at.part, port).position);
  const motion = partMotion(rig, forwardKinematics(rig, pose), at.part.id);

  return (motion ? point.applyMatrix4(motion) : point).toArray() as V3;
}
