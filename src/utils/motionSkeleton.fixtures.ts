import * as THREE from 'three';
import type { ClipVec, MotionClip } from './motionClip';

type Turn = Array<[ClipVec, number]>;

export interface FixtureBone {
  name: string;
  parent: string | null;
  offset: ClipVec | ((t: number) => ClipVec);
  turn?: (t: number) => Turn;
}

const DEG = Math.PI / 180;
const X: ClipVec = [1, 0, 0];
const Y: ClipVec = [0, 1, 0];

function localTurn(turn: Turn): THREE.Quaternion {
  return turn.reduce(
    (q, [axis, deg]) => q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), deg * DEG)),
    new THREE.Quaternion(),
  );
}

function pose(bones: FixtureBone[], t: number | null): ClipVec[] {
  const at = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>();

  return bones.map((b) => {
    const parent = b.parent ? at.get(b.parent)! : { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    const offset = typeof b.offset === 'function' ? b.offset(t ?? 0) : b.offset;
    const p = new THREE.Vector3(...offset).applyQuaternion(parent.q).add(parent.p);
    const q = parent.q.clone().multiply(t === null || !b.turn ? new THREE.Quaternion() : localTurn(b.turn(t)));

    at.set(b.name, { p, q });

    return p.toArray() as ClipVec;
  });
}

export function fkClip(name: string, bones: FixtureBone[], { frames = 60, fps = 30 } = {}): MotionClip {
  return {
    name,
    frameTime: 1 / fps,
    points: bones.map((b) => b.name),
    parentOf: Object.fromEntries(bones.map((b) => [b.name, b.parent])),
    rest: pose(bones, null),
    frames: Array.from({ length: frames }, (_, k) => pose(bones, k / fps)),
    keypoints: {},
  };
}

const wave = (t: number, hz: number, phase = 0) => Math.sin(2 * Math.PI * hz * t + phase);

export interface ArmFixture {
  lengths?: [number, number, number];
  locked?: boolean;
  stretchMm?: number;
}

export function planarArm({ lengths = [100, 80, 60], locked = false, stretchMm = 0 }: ArmFixture = {}): MotionClip {
  const [upper, fore, hand] = lengths;

  return fkClip('Planar arm', [
    { name: 'Shoulder', parent: null, offset: [0, 0, 0], turn: (t) => [[X, 35 * wave(t, 0.5)]] },
    {
      name: 'Elbow',
      parent: 'Shoulder',
      offset: [0, upper, 0],
      turn: (t) => [[X, locked ? 30 : 20 + 40 * wave(t, 0.5, 1)]],
    },
    {
      name: 'Wrist',
      parent: 'Elbow',
      offset: (t) => [0, fore + stretchMm * wave(t, 1), 0],
      turn: (t) => [[X, 30 * wave(t, 1)]],
    },
    { name: 'Tip', parent: 'Wrist', offset: [0, hand, 0] },
  ]);
}

export function panTiltHead(): MotionClip {
  const nod = (t: number) => (t < 1 ? 25 * wave(t, 1) : 0);
  const shake = (t: number) => (t < 1 ? 0 : 35 * wave(t, 1));

  return fkClip('Nod and shake', [
    { name: 'Neck', parent: null, offset: [0, 0, 0], turn: (t) => [[Y, shake(t)]] },
    { name: 'Head', parent: 'Neck', offset: [0, 40, 0], turn: (t) => [[X, nod(t)]] },
    { name: 'HeadEnd', parent: 'Head', offset: [0, 0, 60] },
  ]);
}

const LEGS: Array<[string, number, number, number]> = [
  ['FrontLeft', 60, 100, 0],
  ['FrontRight', -60, 100, Math.PI],
  ['RearLeft', 60, -100, Math.PI],
  ['RearRight', -60, -100, 0],
];

export function trottingQuadruped(): MotionClip {
  const legs = LEGS.flatMap(([leg, x, z, phase]): FixtureBone[] => [
    { name: `${leg}Hip`, parent: 'Body', offset: [x, 0, z], turn: (t) => [[X, 25 * wave(t, 1, phase)]] },
    {
      name: `${leg}Knee`,
      parent: `${leg}Hip`,
      offset: [0, -120, 0],
      turn: (t) => [[X, -20 - 20 * wave(t, 1, phase + 1)]],
    },
    { name: `${leg}Foot`, parent: `${leg}Knee`, offset: [0, -120, 0] },
  ]);

  return fkClip('Trot', [{ name: 'Body', parent: null, offset: (t) => [0, 300 + 5 * wave(t, 2), 0] }, ...legs]);
}
