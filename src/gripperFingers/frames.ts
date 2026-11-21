import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { placementPoint } from '../agent/agentScene';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export function fingerFrame(part: ScenePart) {
  const origin = new Vector3(...placementPoint(part));
  const rotation = new Quaternion().setFromEuler(new Euler(...part.rotation.map((value) => (value * Math.PI) / 180)));
  const at = (point: V3): V3 => new Vector3(...point).applyQuaternion(rotation).add(origin).toArray() as V3;
  const direction = (axis: V3): V3 => new Vector3(...axis).applyQuaternion(rotation).toArray() as V3;

  return { origin, rotation, at, direction };
}

export function rotationDegrees(rotation: Quaternion): V3 {
  const euler = new Euler().setFromRotationMatrix(new Matrix4().makeRotationFromQuaternion(rotation));

  return [euler.x, euler.y, euler.z].map((value) => (value * 180) / Math.PI) as V3;
}
