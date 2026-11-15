import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { toScene } from '../agent/agentFrame';
import { specToPart } from '../agent/agentScene';
import { findPort } from '../agent/ports';
import { buildSkeleton } from '../agent/skeleton';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';

export function motionPayload(skeleton: RobotSkeleton) {
  return {
    joints: skeleton.joints.map(({ linkMassG, payloadG, ...joint }) => ({
      ...joint,
      link_mass_g: linkMassG,
      payload_g: payloadG,
    })),
    pairs: skeleton.pairs,
    mass_g: skeleton.massG,
    replace: true,
  };
}

function servoId(joint: SkeletonJoint, used: Set<string>): string {
  const base = `motion-${joint.id}-servo`;
  let id = base;
  let suffix = 1;

  while (used.has(id)) id = `${base}-${++suffix}`;

  used.add(id);

  return id;
}

function servoAt(joint: SkeletonJoint, id: string): ScenePart {
  const part = specToPart({ id, catalog: joint.actuator, frame: joint.id });
  const output = findPort(part, 'output');

  if (!output) throw new Error(`${joint.id}: choose a catalog servo with an output port.`);

  const axis = new Vector3(...toScene(joint.axis)).normalize();
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(...output.axis).normalize(), axis);
  const euler = new Euler().setFromQuaternion(rotation, 'XYZ');
  const center = new Vector3(...toScene(joint.origin)).sub(new Vector3(...output.position).applyQuaternion(rotation));

  return {
    ...part,
    position: center.toArray() as ZUpVec,
    rotation: [euler.x, euler.y, euler.z].map(MathUtils.radToDeg) as ZUpVec,
  };
}

export function motionBuild(skeleton: RobotSkeleton, taken: ReadonlySet<string>, previous?: RobotSkeleton) {
  const built = buildSkeleton(motionPayload(skeleton), previous);

  const used = new Set(taken);
  const parts = built.skeleton.joints.map((joint) => servoAt(joint, servoId(joint, used)));

  return { skeleton: built.skeleton, parts };
}
