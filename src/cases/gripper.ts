import * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isMovable, type Rig, type V3 } from '../utils/kinematics';

export interface GripperJaw {
  joint: string;
  open: number;
  closed: number;
}

export interface Gripper {
  jaws: GripperJaw[];
  palm: string;
  centre: V3;
  approach: V3;
  across: V3;
  openingMm: number;
  closedOpeningMm: number;
  depthMm: number;
  palmMm: number;
}

interface Jaw {
  joint: RobotJoint;
  part: ScenePart;
  at: THREE.Vector3;
}

const FACING = 0.7;

const vec = (v: readonly number[]) => new THREE.Vector3(v[0], v[1], v[2]);

const toV3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

function motionOf({ joint, at }: Jaw): THREE.Vector3 {
  const axis = vec(joint.axis).normalize();

  if (joint.type === 'prismatic') return axis;

  return axis.cross(at.clone().sub(vec(joint.origin))).normalize();
}

function extentAlong(part: ScenePart, dir: THREE.Vector3): number {
  const rotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...part.rotation.map((n) => THREE.MathUtils.degToRad(n))),
  );
  const local = dir.clone().applyQuaternion(rotation.invert());

  return (
    Math.abs(local.x) * part.dimensions.width +
    Math.abs(local.y) * part.dimensions.height +
    Math.abs(local.z) * part.dimensions.depth
  );
}

function closedAt(jaw: Jaw, limit: number): THREE.Vector3 {
  const axis = vec(jaw.joint.axis).normalize();

  if (jaw.joint.type === 'prismatic') return jaw.at.clone().addScaledVector(axis, limit);

  const origin = vec(jaw.joint.origin);

  return jaw.at.clone().sub(origin).applyAxisAngle(axis, THREE.MathUtils.degToRad(limit)).add(origin);
}

function closedExtent(jaw: Jaw, limit: number, across: THREE.Vector3): number {
  const direction = across.clone();

  if (jaw.joint.type !== 'prismatic')
    direction.applyAxisAngle(vec(jaw.joint.axis).normalize(), -THREE.MathUtils.degToRad(limit));

  return extentAlong(jaw.part, direction);
}

function closingLimit(jaw: Jaw, toward: THREE.Vector3): number | null {
  const along = motionOf(jaw).dot(toward);
  const range = jaw.joint.range;

  if (Math.abs(along) < FACING || !range) return null;

  const limit = along > 0 ? Math.max(...range) : Math.min(...range);

  return Math.abs(limit) > 1e-6 && Math.sign(limit) === Math.sign(along) ? limit : null;
}

function jawsOf(rig: Rig, palm: string | null, byId: Map<string, ScenePart>, joints: RobotJoint[]): Jaw[] {
  const leaves = joints.filter(
    (j) => isMovable(j) && rig.parentOf.get(j.id) === palm && !joints.some((c) => rig.parentOf.get(c.id) === j.id),
  );

  return leaves.flatMap((joint) => {
    const owned = [...rig.ownerOf].find(([id, owner]) => owner === joint.id && byId.has(id));
    const part = owned ? byId.get(owned[0])! : null;

    return part ? [{ joint, part, at: vec(part.position) }] : [];
  });
}

function facingPair(jaws: Jaw[]): [Jaw, Jaw, number, number] | null {
  for (const a of jaws)
    for (const b of jaws) {
      if (a === b) continue;

      const across = b.at.clone().sub(a.at).normalize();
      const closeA = closingLimit(a, across);
      const closeB = closingLimit(b, across.clone().negate());

      if (closeA !== null && closeB !== null) return [a, b, closeA, closeB];
    }

  return null;
}

export function findGripper(rig: Rig, joints: RobotJoint[], byId: Map<string, ScenePart>): Gripper | null {
  const palms = [...new Set(joints.map((j) => rig.parentOf.get(j.id)).filter((p): p is string => !!p))];

  for (const palm of palms) {
    const pair = facingPair(jawsOf(rig, palm, byId, joints));

    if (!pair) continue;

    const [a, b, closeA, closeB] = pair;
    const centre = a.at.clone().add(b.at).multiplyScalar(0.5);
    const across = b.at.clone().sub(a.at).normalize();
    const fromPalm = centre.clone().sub(vec(rig.byId.get(palm)?.origin ?? [0, 0, 0]));
    const approach = fromPalm.clone().normalize();

    return {
      jaws: [
        { joint: a.joint.id, open: 0, closed: closeA },
        { joint: b.joint.id, open: 0, closed: closeB },
      ],
      palm,
      centre: toV3(centre),
      approach: toV3(approach),
      across: toV3(across),
      openingMm: a.at.distanceTo(b.at) - (extentAlong(a.part, across) + extentAlong(b.part, across)) / 2,
      closedOpeningMm: Math.max(
        0,
        closedAt(b, closeB).sub(closedAt(a, closeA)).dot(across) -
          (closedExtent(a, closeA, across) + closedExtent(b, closeB, across)) / 2,
      ),
      depthMm: Math.max(extentAlong(a.part, approach), extentAlong(b.part, approach)) / 2,
      palmMm: fromPalm.length(),
    };
  }

  return null;
}
