import * as THREE from 'three';
import { toCad, type V3 } from '../agent/agentFrame';
import type { RobotJoint } from '../types/robotics';

export const REACH_SCALE = 0.5;
export const LINK_REACH = 20;
export const LINK_WEB = 6;
export const MIN_LINK_MM = 56;
export const BASE_HEIGHT_MM = 36;

const PARALLEL = 1e-6;
const DEG = 180 / Math.PI;

export interface ServoFrame {
  origin: THREE.Vector3;
  x: THREE.Vector3;
  z: THREE.Vector3;
}

export interface LinkStep {
  length: number;
  twist: number;
}

export interface LeaderFrames {
  joints: ServoFrame[];
  links: LinkStep[];
  cradles: ServoFrame[];
}

const vec = (v: V3) => new THREE.Vector3(...v);
const cadAxis = (j: RobotJoint) => vec(toCad(j.axis)).normalize();

export function frameMatrix(f: ServoFrame): THREE.Matrix4 {
  const y = f.z.clone().cross(f.x);

  return new THREE.Matrix4().makeBasis(f.x, y, f.z).setPosition(f.origin);
}

export function chainReach(points: V3[]): number {
  let total = 0;

  for (let i = 1; i < points.length; i++) total += vec(points[i]).distanceTo(vec(points[i - 1]));

  return total;
}

function perpendicularTo(axis: THREE.Vector3, hint: THREE.Vector3): THREE.Vector3 {
  const flat = hint.clone().addScaledVector(axis, -hint.dot(axis));

  if (flat.lengthSq() > PARALLEL) return flat.normalize();

  const other = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);

  return other.addScaledVector(axis, -other.dot(axis)).normalize();
}

const UP = new THREE.Vector3(0, 0, 1);
const LEANING = 0.3;
const FOLDED = -0.5;

function normalSign(n: THREE.Vector3, previous: THREE.Vector3 | undefined, offset: THREE.Vector3 | undefined): number {
  const along = offset && offset.lengthSq() > PARALLEL ? n.dot(offset) / offset.length() : 0;
  const back = previous ? n.dot(previous) : 0;
  const lean = Math.abs(along) > LEANING ? Math.sign(along) : 0;
  const sign = lean || (Math.abs(back) > LEANING ? Math.sign(back) : 0) || (n.dot(UP) < 0 ? -1 : 1);

  return sign * back < FOLDED ? -sign : sign;
}

function commonNormal(a: THREE.Vector3, b: THREE.Vector3, previous?: THREE.Vector3, offset?: THREE.Vector3) {
  const n = a.clone().cross(b);

  if (n.lengthSq() < PARALLEL) return null;

  n.normalize();

  return n.multiplyScalar(normalSign(n, previous, offset));
}

function linkDirections(axes: THREE.Vector3[], offsets: THREE.Vector3[]): THREE.Vector3[] {
  const dirs: THREE.Vector3[] = [];

  axes.forEach((a, i) => {
    const previous = dirs[i - 1];
    const next = axes[i + 1];
    const hint = previous ?? offsets[0] ?? new THREE.Vector3(1, 0, 0);
    const normal = next ? commonNormal(a, next, previous, offsets[i]) : null;

    dirs.push(normal ?? perpendicularTo(a, hint));
  });

  return dirs;
}

function linkLengths(follower: number[]): number[] {
  const target = REACH_SCALE * follower.reduce((s, v) => s + v, 0);
  const total = (s: number) => follower.reduce((sum, v) => sum + Math.max(MIN_LINK_MM, s * v), 0);
  let lo = 0;
  let hi = REACH_SCALE;

  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;

    if (total(mid) > target) hi = mid;
    else lo = mid;
  }

  return follower.map((v) => Math.round(Math.max(MIN_LINK_MM, lo * v) * 2) / 2);
}

function signedAngle(from: THREE.Vector3, to: THREE.Vector3, about: THREE.Vector3): number {
  return Math.round(Math.atan2(from.clone().cross(to).dot(about), from.dot(to)) * DEG * 100) / 100;
}

function servoAxes(axes: THREE.Vector3[]): THREE.Vector3[] {
  return axes.map((a, i) => (i === 0 && a.z < -PARALLEL ? a.clone().negate() : a.clone()));
}

export function leaderFrames(arm: RobotJoint[]): LeaderFrames {
  const axes = servoAxes(arm.map(cadAxis));
  const origins = arm.map((j) => vec(toCad(j.origin)));
  const offsets = origins.slice(1).map((o, i) => o.clone().sub(origins[i]));
  const dirs = linkDirections(axes, offsets);
  const lengths = linkLengths(offsets.map((d) => d.length()));
  const joints: ServoFrame[] = [{ origin: new THREE.Vector3(0, 0, BASE_HEIGHT_MM), x: dirs[0], z: axes[0] }];
  const cradles: ServoFrame[] = [joints[0]];
  const links: LinkStep[] = [];

  lengths.forEach((length, i) => {
    const origin = joints[i].origin.clone().addScaledVector(dirs[i], length);

    links.push({ length, twist: signedAngle(axes[i], axes[i + 1], dirs[i]) });
    cradles.push({ origin, x: dirs[i], z: axes[i + 1] });
    joints.push({ origin, x: dirs[i + 1], z: axes[i + 1] });
  });

  return { joints, links, cradles };
}
