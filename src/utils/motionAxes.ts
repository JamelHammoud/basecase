import * as THREE from 'three';
import { symmetricEigen } from '../joints/cylinderFit';
import type { ZUpVec } from '../types/skeleton';
import type { MotionChain } from './motionChains';

export interface CandidateAxis {
  joint: number;
  axis: ZUpVec;
  spanDeg: number;
  weight: number;
}

export const MIN_SPAN_DEG = 2;

const SNAP_DEG = 3;
const SHORT_MM = 1e-3;
const DEG = 180 / Math.PI;
const UP = new THREE.Vector3(0, 0, 1);

const vec = (v: ZUpVec) => new THREE.Vector3(v[0], v[1], v[2]);
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

function rotationVector(q: THREE.Quaternion): THREE.Vector3 {
  const w = Math.min(1, Math.abs(q.w));
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(1 - w * w);

  if (s < 1e-9) return new THREE.Vector3();

  return new THREE.Vector3(q.x, q.y, q.z).multiplyScalar((Math.sign(q.w || 1) * angle) / s);
}

function swings(chain: MotionChain): Array<THREE.Vector3[] | null> {
  const joints = chain.rest.length - 1;
  const out: Array<THREE.Vector3[] | null> = Array.from({ length: joints }, () => []);
  const restDirs = Array.from({ length: joints }, (_, i) => vec(chain.rest[i + 1]).sub(vec(chain.rest[i])));

  for (const frame of chain.frames) {
    const parent = new THREE.Quaternion();

    for (let i = 0; i < joints; i++) {
      const dir = vec(frame[i + 1]).sub(vec(frame[i]));

      if (restDirs[i].length() < SHORT_MM || dir.length() < SHORT_MM) {
        out[i] = null;

        continue;
      }

      const local = dir.normalize().applyQuaternion(parent.clone().invert());
      const swing = new THREE.Quaternion().setFromUnitVectors(restDirs[i].clone().normalize(), local);

      out[i]?.push(rotationVector(swing));
      parent.multiply(swing);
    }
  }

  return out;
}

function snapped(v: THREE.Vector3): ZUpVec {
  const axis = v.clone().normalize();
  const biggest = [axis.x, axis.y, axis.z].reduce(
    (best, x, k, all) => (Math.abs(x) > Math.abs(all[best]) ? k : best),
    0,
  );

  if ([axis.x, axis.y, axis.z][biggest] < 0) axis.negate();

  const world = new THREE.Vector3().setComponent(biggest, 1);

  if (axis.angleTo(world) * DEG < SNAP_DEG) return world.toArray() as ZUpVec;

  return axis.toArray().map(r3) as ZUpVec;
}

function lever(chain: MotionChain, joint: number): number {
  const at = vec(chain.rest[joint]);

  return Math.max(...chain.rest.slice(joint + 1).map((p) => vec(p).distanceTo(at)));
}

function moments(rotations: THREE.Vector3[]): number[][] {
  const m = [0, 1, 2].map(() => [0, 0, 0]);

  for (const w of rotations) {
    const a = w.toArray();

    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r][c] += a[r] * a[c];
  }

  return m;
}

function jointAxes(chain: MotionChain, joint: number, rotations: THREE.Vector3[]): CandidateAxis[] {
  const principal = symmetricEigen(moments(rotations)).slice(1).reverse();

  return principal.flatMap(({ vector }) => {
    const axis = vec(vector).normalize();
    const angles = rotations.map((w) => w.dot(axis));
    const spanDeg = (Math.max(...angles) - Math.min(...angles)) * DEG;

    if (spanDeg < MIN_SPAN_DEG) return [];

    return [{ joint, axis: snapped(axis), spanDeg, weight: (spanDeg / DEG) * lever(chain, joint) }];
  });
}

export function candidateAxes(chain: MotionChain): CandidateAxis[] {
  return swings(chain)
    .flatMap((rotations, joint) => (rotations ? jointAxes(chain, joint, rotations) : []))
    .sort((a, b) => b.weight - a.weight || a.joint - b.joint);
}

function parentDirection(chain: MotionChain, joint: number): THREE.Vector3 {
  if (joint === 0) return UP;

  return vec(chain.rest[joint])
    .sub(vec(chain.rest[joint - 1]))
    .normalize();
}

export function chainOrder(chain: MotionChain, axes: CandidateAxis[]): CandidateAxis[] {
  const along = (a: CandidateAxis) => Math.abs(vec(a.axis).dot(parentDirection(chain, a.joint)));

  return [...axes].sort((a, b) => a.joint - b.joint || along(b) - along(a));
}
