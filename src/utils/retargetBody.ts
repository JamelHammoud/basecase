import * as THREE from 'three';
import type { Keypoint } from './mocapBones';
import type { RobotLandmarks } from './retargetRobot';

export type Human = Map<Keypoint, THREE.Vector3>;

export interface RestBody {
  face: THREE.Quaternion;
  faceInv: THREE.Quaternion;
  scale: number;
  humanLeg: number | null;
  byHeight: boolean;
  hipsRest: THREE.Vector3;
  keys: BasisKeys | null;
  basis: THREE.Quaternion | null;
}

const STEADY = 0.03;

function facing(rest: Human): THREE.Quaternion {
  const face = new THREE.Quaternion();
  const rl = rest.get('leftHip') ?? rest.get('leftShoulder');
  const rr = rest.get('rightHip') ?? rest.get('rightShoulder');

  if (!rl || !rr) return face;

  const up = new THREE.Vector3(0, 1, 0);
  const left = rl.clone().sub(rr).setY(0).normalize();
  const fwd = left.clone().cross(up).normalize();

  return face.setFromUnitVectors(fwd, new THREE.Vector3(0, 0, 1));
}

function legLength(pos: (k: Keypoint) => THREE.Vector3 | undefined): number | null {
  const a = pos('leftHip'),
    b = pos('leftKnee'),
    c = pos('leftAnkle');

  return a && b && c ? a.distanceTo(b) + b.distanceTo(c) : null;
}

function bodyScale(rest: Human, robot: RobotLandmarks) {
  const humanLeg = legLength((k) => rest.get(k));
  const robotLeg = legLength((k) => robot.rp.get(k));
  const heightRatio = () => (robot.rp.get('hips')!.y || 500) / Math.max(rest.get('hips')?.y ?? 1, 1e-3);
  const scale = humanLeg && robotLeg ? robotLeg / humanLeg : heightRatio();

  return { humanLeg, scale, byHeight: !humanLeg || !robotLeg };
}

export interface BasisKeys {
  left: Keypoint;
  right: Keypoint;
  spine: boolean;
}

function basisKeys(rest: Human): BasisKeys | null {
  const spine = rest.has('hips') && rest.has('chest');

  if (rest.has('leftHip') && rest.has('rightHip')) return { left: 'leftHip', right: 'rightHip', spine };

  if (rest.has('leftShoulder') && rest.has('rightShoulder'))
    return { left: 'leftShoulder', right: 'rightShoulder', spine };

  return null;
}

export function bodyBasis(h: Human, keys: BasisKeys | null): THREE.Quaternion | null {
  const l = keys && h.get(keys.left),
    r = keys && h.get(keys.right);
  const hips = h.get('hips'),
    chest = h.get('chest');

  if (!keys || !l || !r || (keys.spine && (!hips || !chest))) return null;

  const x = l.clone().sub(r).normalize();
  const up = keys.spine ? chest!.clone().sub(hips!) : new THREE.Vector3(0, 1, 0);
  const z = x.clone().cross(up).normalize();
  const y = z.clone().cross(x);

  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function restBody(rest: Human, robot: RobotLandmarks): RestBody {
  const face = facing(rest);
  const keys = basisKeys(rest);

  return {
    face,
    faceInv: face.clone().invert(),
    ...bodyScale(rest, robot),
    hipsRest: rest.get('hips') ?? new THREE.Vector3(),
    keys,
    basis: bodyBasis(rest, keys),
  };
}

const sameKeys = (a: Human, b: Human) => a.size === b.size && [...a.keys()].every((k) => b.has(k));

const hasSides = (h: Human) =>
  (h.has('leftHip') && h.has('rightHip')) || (h.has('leftShoulder') && h.has('rightShoulder'));

function span(h: Human): number {
  const box = new THREE.Box3().setFromPoints([...h.values()]);

  return box.getSize(new THREE.Vector3()).length();
}

function mean(window: Human[]): Human {
  const out: Human = new Map();

  for (const k of window[0].keys()) {
    const sum = new THREE.Vector3();

    for (const h of window) sum.add(h.get(k)!);

    out.set(k, sum.divideScalar(window.length));
  }

  return out;
}

function steady(window: Human[]): boolean {
  const last = window[window.length - 1];

  if (!hasSides(last) || !window.every((h) => sameKeys(h, last))) return false;

  const avg = mean(window);
  const tol = STEADY * span(avg);

  return window.every((h) => [...h].every(([k, p]) => p.distanceTo(avg.get(k)!) <= tol));
}

export function calibrator(frames: number): (h: Human) => Human | null {
  const window: Human[] = [];

  return (h) => {
    window.push(h);

    if (window.length > frames) window.shift();

    return window.length === frames && steady(window) ? mean(window) : null;
  };
}
