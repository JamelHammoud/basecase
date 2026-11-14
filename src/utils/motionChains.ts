import type { SkeletonLimb, ZUpVec } from '../types/skeleton';
import { cross, dot, norm, sub } from './engineeringMath';
import type { Keypoint } from './mocapBones';
import type { ClipVec, MotionClip } from './motionClip';

export interface MotionChain {
  id: string;
  limb: SkeletonLimb;
  names: string[];
  rest: ZUpVec[];
  frames: ZUpVec[][];
}

type Basis = [ZUpVec, ZUpVec, ZUpVec];

interface BodyFrame {
  at: ZUpVec;
  basis: Basis | null;
}

const LIMB_SHARE_OF_HEIGHT = 0.04;
const HAND_EXTENT = 0.5;
const FOOT_HEIGHT = 0.1;
const FLAT = 1e-6;
const BODY_KEYPOINTS = ['hips', 'chest'];

const add = (a: ZUpVec, b: ZUpVec): ZUpVec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const length = (v: ZUpVec) => Math.hypot(v[0], v[1], v[2]);
const r1 = (v: number) => Math.round(v * 10) / 10 + 0;

const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'joint';

function toMm(clip: MotionClip, heightMm: number): (p: ClipVec) => ZUpVec {
  const ys = clip.rest.map((p) => p[1]);
  const scale = heightMm / Math.max(Math.max(...ys) - Math.min(...ys), 1e-9);
  const first = clip.frames[0] ?? clip.rest;
  const floor = Math.min(...first.map((p) => p[1]));
  const root = first[clip.points.findIndex((p) => clip.parentOf[p] === null)] ?? [0, 0, 0];

  return ([x, y, z]) => [r1((x - root[0]) * scale), r1(-(z - root[2]) * scale), r1((y - floor) * scale)];
}

function childrenOf(clip: MotionClip): Map<number, number[]> {
  const index = new Map(clip.points.map((p, i) => [p, i]));
  const out = new Map<number, number[]>(clip.points.map((_, i) => [i, []]));

  clip.points.forEach((p, i) => {
    const parent = clip.parentOf[p];

    if (parent !== null && index.has(parent)) out.get(index.get(parent)!)!.push(i);
  });

  return out;
}

interface Path {
  attach: number | null;
  points: number[];
}

function walk(start: number, kids: Map<number, number[]>): number[] {
  const path = [start];
  let at = start;

  while (kids.get(at)!.length === 1) {
    at = kids.get(at)![0];
    path.push(at);
  }

  return path;
}

function paths(clip: MotionClip, kids: Map<number, number[]>): Path[] {
  const out: Path[] = [];

  clip.points.forEach((p, i) => {
    const children = kids.get(i)!;
    const root = clip.parentOf[p] === null;

    if (root && children.length === 1) out.push({ attach: null, points: walk(i, kids) });
    else if (root || children.length > 1) out.push(...children.map((c) => ({ attach: i, points: walk(c, kids) })));
  });

  return out;
}

function descendants(i: number, kids: Map<number, number[]>): number[] {
  const out: number[] = [];
  const queue = [...kids.get(i)!];

  while (queue.length) {
    const next = queue.shift()!;

    out.push(next);
    queue.push(...kids.get(next)!);
  }

  return out;
}

const pathLength = (rest: ZUpVec[], points: number[]) =>
  points.slice(1).reduce((s, p, k) => s + length(sub(rest[p], rest[points[k]])), 0);

function isLimb(path: Path, rest: ZUpVec[], kids: Map<number, number[]>, heightMm: number): boolean {
  const long = pathLength(rest, path.points);

  if (path.points.length < 2 || long < LIMB_SHARE_OF_HEIGHT * heightMm) return false;

  const end = path.points[path.points.length - 1];
  const extent = Math.max(0, ...descendants(end, kids).map((d) => length(sub(rest[d], rest[end]))));

  return extent < HAND_EXTENT * long;
}

function basisOf(at: ZUpVec, a: ZUpVec, c: ZUpVec): Basis | null {
  const e1 = sub(a, at);
  const n = cross(e1, sub(c, at));

  if (length(e1) < FLAT || length(n) < FLAT * length(e1)) return null;

  const x = norm(e1);
  const z = norm(n);

  return [x, cross(z, x), z];
}

function rigidPair(attach: number, kids: Map<number, number[]>, rest: ZUpVec[]): [number, number] | null {
  const set = kids.get(attach)!;
  let best: [number, number] | null = null;
  let area = 0;

  for (const a of set)
    for (const c of set) {
      const size = length(cross(sub(rest[a], rest[attach]), sub(rest[c], rest[attach])));

      if (size > area + FLAT) [best, area] = [[a, c], size];
    }

  return best;
}

function bodyFrame(attach: number | null, pair: [number, number] | null, at: ZUpVec[]): BodyFrame {
  if (attach === null) return { at: [0, 0, 0], basis: null };

  return { at: at[attach], basis: pair && basisOf(at[attach], at[pair[0]], at[pair[1]]) };
}

const inBasis = (b: Basis, v: ZUpVec): ZUpVec => [dot(b[0], v), dot(b[1], v), dot(b[2], v)];
const fromBasis = (b: Basis, v: ZUpVec): ZUpVec =>
  [0, 1, 2].map((k) => b[0][k] * v[0] + b[1][k] * v[1] + b[2][k] * v[2]) as ZUpVec;

function localize(p: ZUpVec, now: BodyFrame, rest: BodyFrame): ZUpVec {
  const offset = sub(p, now.at);
  const turned = now.basis && rest.basis ? fromBasis(rest.basis, inBasis(now.basis, offset)) : offset;

  return add(turned, rest.at);
}

const SIDE_LIMB: Array<[RegExp, string, SkeletonLimb]> = [
  [/Shoulder|Elbow|Wrist/, 'arm', 'arm'],
  [/Hip|Knee|Ankle|Toe/, 'leg', 'leg'],
];

function keypointLimb(k: Keypoint): { id: string; limb: SkeletonLimb } {
  if (k === 'neck' || k === 'head') return { id: 'neck', limb: 'neck' };

  const side = k.startsWith('left') ? 'left' : 'right';
  const hit = SIDE_LIMB.find(([pattern]) => pattern.test(k));

  return hit ? { id: `${side}_${hit[1]}`, limb: hit[2] } : { id: 'torso', limb: 'torso' };
}

interface Naming {
  keypointOf: Map<string, Keypoint>;
  heightMm: number;
}

function chainName(clip: MotionClip, points: number[], rest: ZUpVec[], naming: Naming) {
  const names = points.map((i) => snake(naming.keypointOf.get(clip.points[i]) ?? clip.points[i]));
  const mapped = points.map((i) => naming.keypointOf.get(clip.points[i])).find((k) => k !== undefined);

  if (mapped) return { names, ...keypointLimb(mapped) };

  const first = clip.points[points[0]];
  const effector = rest[points[points.length - 1]];
  const neck: SkeletonLimb = /neck|head/i.test(first) ? 'neck' : 'arm';
  const limb: SkeletonLimb = effector[2] < FOOT_HEIGHT * naming.heightMm ? 'leg' : neck;

  return { names, id: snake(first), limb };
}

function uniqueChainIds(chains: MotionChain[]): MotionChain[] {
  const seen = new Map<string, number>();

  return chains.map((c) => {
    const n = (seen.get(c.id) ?? 0) + 1;

    seen.set(c.id, n);

    return n === 1 ? c : { ...c, id: `${c.id}_${n}` };
  });
}

export function motionChains(clip: MotionClip, heightMm: number): MotionChain[] {
  const mm = toMm(clip, heightMm);
  const rest = clip.rest.map(mm);
  const frames = clip.frames.map((f) => f.map(mm));
  const kids = childrenOf(clip);
  const naming: Naming = {
    keypointOf: new Map(
      Object.entries(clip.keypoints)
        .filter(([k]) => !BODY_KEYPOINTS.includes(k))
        .map(([k, bone]) => [bone, k as Keypoint]),
    ),
    heightMm,
  };
  const chains = paths(clip, kids)
    .filter((path) => isLimb(path, rest, kids, heightMm))
    .map((path): MotionChain => {
      const pair = path.attach === null ? null : rigidPair(path.attach, kids, rest);
      const first = frames[0];
      const restFrame = bodyFrame(path.attach, pair, first);

      return {
        ...chainName(clip, path.points, first, naming),
        rest: path.points.map((i) => first[i]),
        frames: frames.map((f) => {
          const now = bodyFrame(path.attach, pair, f);

          return path.points.map((i) => localize(f[i], now, restFrame));
        }),
      };
    });

  return uniqueChainIds(chains);
}
