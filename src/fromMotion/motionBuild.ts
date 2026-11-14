import * as THREE from 'three';
import { eulerToMatrix, matrixToEuler, r3, toScene } from '../agent/agentFrame';
import { specToPart } from '../agent/agentScene';
import { portsOf } from '../agent/ports';
import { buildSkeleton } from '../agent/skeleton';
import { uniqueIds } from '../arm/armBuild';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import type { V3 } from '../utils/kinematicsRig';
import type { MotionFit } from '../utils/motionSkeleton';

export interface MotionScene {
  parts: () => ScenePart[];
  skeleton: () => RobotSkeleton | undefined;
  place: (parts: ScenePart[], skeleton: RobotSkeleton) => void;
}

export interface MotionBuild {
  parts: ScenePart[];
  skeleton: RobotSkeleton;
}

const vec = (v: readonly number[]) => new THREE.Vector3(v[0], v[1], v[2]);

export function servoOnJoint(joint: SkeletonJoint, id: string): ScenePart {
  const part = specToPart({ id, catalog: joint.actuator!, frame: joint.id });
  const output = portsOf(part).find((p) => p.kind === 'output');
  const origin = vec(toScene(joint.origin));

  if (!output) return { ...part, position: origin.toArray().map(r3) as V3 };

  const turn = new THREE.Quaternion().setFromUnitVectors(
    vec(output.axis).normalize(),
    vec(toScene(joint.axis)).normalize(),
  );
  const rotation = matrixToEuler(new THREE.Matrix4().makeRotationFromQuaternion(turn));
  const position = origin.sub(vec(output.position).applyMatrix4(eulerToMatrix(rotation)));

  return { ...part, position: position.toArray().map(r3) as V3, rotation };
}

export function motionBuild(fit: MotionFit, name: string, scene: Omit<MotionScene, 'place'>): MotionBuild {
  const skeleton = buildSkeleton({ ...fit.skeleton, replace: true }, scene.skeleton()).skeleton;
  const driven = skeleton.joints.filter((j) => j.actuator);
  const rename = uniqueIds(
    driven.map((j) => `${j.id}-servo`),
    new Set(scene.parts().map((p) => p.id)),
  );
  const group = driven.length ? { id: `group-${rename.get(`${driven[0].id}-servo`)!}`, name } : undefined;
  const parts = driven.map((j) => ({ ...servoOnJoint(j, rename.get(`${j.id}-servo`)!), group }));

  return { parts, skeleton };
}

export function placeMotion(fit: MotionFit, name: string, scene: MotionScene): void {
  const built = motionBuild(fit, name, scene);

  scene.place([...scene.parts(), ...built.parts], built.skeleton);
}
