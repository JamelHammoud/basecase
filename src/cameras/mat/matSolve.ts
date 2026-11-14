import type { FloorPoint } from './tag36h11';
import { apply, fitHomography, invert, type Mat3, type PointPair, type Pt } from './homography';

export type V3 = [number, number, number];

export interface TrackTag {
  id: number;
  corners: FloorPoint[];
  size: number;
}

export interface TrackMat {
  tags: TrackTag[];
  base: { id: number; size: number; height: number; up: FloorPoint };
}

export interface SeenTag {
  id: number;
  corners: [number, number][];
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface MatView {
  homography: Mat3;
  tags: number;
  scale: number;
  residualMm: number;
  focal: number | null;
}

export interface CameraPose {
  rotation: V3[];
  center: V3;
  focal: number;
}

export interface BaseFix {
  x: number;
  z: number;
  yaw: number;
}

const MIN_MAT_TAGS = 2;
const MIN_FOCAL = 0.3;
const MAX_FOCAL = 6;

export const toLens = (frame: FrameSize, [px, py]: Pt): Pt => {
  const half = frame.width / 2;

  return [(px - half) / half, (py - frame.height / 2) / half];
};

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function focalOf(h: Mat3): number | null {
  const norm = Math.hypot(...h);
  const [a, , , d, , , g] = h.map((v) => v / norm);
  const [b, e, k] = [h[1] / norm, h[4] / norm, h[7] / norm];
  const rows = [
    [a * b + d * e, g * k],
    [a * a + d * d - b * b - e * e, g * g - k * k],
  ];
  const top = rows.reduce((s, [p, q]) => s + p * q, 0);
  const bottom = rows.reduce((s, [p]) => s + p * p, 0);
  const w = bottom > 0 ? -top / bottom : NaN;
  const focal = 1 / Math.sqrt(w);

  return Number.isFinite(focal) && focal >= MIN_FOCAL && focal <= MAX_FOCAL ? focal : null;
}

function tagScale(tag: TrackTag, seen: SeenTag, toFloor: Mat3, frame: FrameSize): number {
  const floor = seen.corners.map((c) => apply(toFloor, toLens(frame, c)));
  const sides = floor.map((p, i) => Math.hypot(p[0] - floor[(i + 1) % 4][0], p[1] - floor[(i + 1) % 4][1]));

  return sides.reduce((s, v) => s + v, 0) / 4 / tag.size;
}

function residualMm(pairs: PointPair[], toFloor: Mat3): number {
  const sum = pairs.reduce((s, p) => {
    const [x, z] = apply(toFloor, p.to);

    return s + (x - p.from[0]) ** 2 + (z - p.from[1]) ** 2;
  }, 0);

  return Math.sqrt(sum / pairs.length);
}

export function viewMat(seen: SeenTag[], mat: TrackMat, frame: FrameSize): MatView | null {
  const byId = new Map(mat.tags.map((t) => [t.id, t]));
  const matched = seen.flatMap((s) => {
    const tag = byId.get(s.id);

    return tag ? [{ tag, seen: s }] : [];
  });

  if (matched.length < MIN_MAT_TAGS) return null;

  const pairs = matched.flatMap(({ tag, seen: s }) =>
    tag.corners.map((corner, i) => ({ from: corner, to: toLens(frame, s.corners[i]) })),
  );
  const homography = fitHomography(pairs);
  const toFloor = homography && invert(homography);

  if (!homography || !toFloor) return null;

  return {
    homography,
    tags: matched.length,
    scale: median(matched.map((m) => tagScale(m.tag, m.seen, toFloor, frame))),
    residualMm: residualMm(pairs, toFloor),
    focal: focalOf(homography),
  };
}

function orthonormal(xAxis: V3, zAxis: V3): V3[] {
  const a = unit(xAxis);
  const c = unit(zAxis);
  const sum = unit(add(a, c));
  const diff = unit(sub(a, c));
  const x = scale(add(sum, diff), Math.SQRT1_2);
  const z = scale(sub(sum, diff), Math.SQRT1_2);

  return [x, cross(z, x), z];
}

export function cameraPose(view: MatView, focal: number, mat: TrackMat): CameraPose | null {
  const h = view.homography;
  const b1: V3 = [h[0] / focal, h[3] / focal, h[6]];
  const b2: V3 = [h[1] / focal, h[4] / focal, h[7]];
  const b3: V3 = [h[2] / focal, h[5] / focal, h[8]];
  const lambda = 2 / (Math.hypot(...b1) + Math.hypot(...b2));
  const [cx, cz] = mat.tags[0].corners[0];
  const depth = lambda * (b1[2] * cx + b2[2] * cz + b3[2]);
  const signed = depth > 0 ? lambda : -lambda;
  const [r1, r2, r3] = orthonormal(scale(b1, signed), scale(b2, signed));
  const t = scale(b3, signed);
  const center: V3 = [-dot(r1, t), -dot(r2, t), -dot(r3, t)];

  if (!center.every(Number.isFinite) || center[1] <= 0) return null;

  return { rotation: [r1, r2, r3], center, focal };
}

function rayToHeight(pose: CameraPose, lens: Pt, height: number): FloorPoint | null {
  const [r1, r2, r3] = pose.rotation;
  const inCamera: V3 = [lens[0] / pose.focal, lens[1] / pose.focal, 1];
  const world: V3 = [dot(r1, inCamera), dot(r2, inCamera), dot(r3, inCamera)];
  const along = (height - pose.center[1]) / world[1];

  if (!Number.isFinite(along) || along <= 0) return null;

  return [pose.center[0] + world[0] * along, pose.center[2] + world[2] * along];
}

export function locateBase(seen: SeenTag[], mat: TrackMat, frame: FrameSize, pose: CameraPose): BaseFix | null {
  const tag = seen.find((s) => s.id === mat.base.id);

  if (!tag) return null;

  const hits = tag.corners.map((c) => rayToHeight(pose, toLens(frame, c), mat.base.height));

  if (hits.some((p) => !p)) return null;

  const [tl, tr, br, bl] = hits as FloorPoint[];
  const up: FloorPoint = [(tl[0] + tr[0] - bl[0] - br[0]) / 2, (tl[1] + tr[1] - bl[1] - br[1]) / 2];

  return {
    x: (tl[0] + tr[0] + br[0] + bl[0]) / 4,
    z: (tl[1] + tr[1] + br[1] + bl[1]) / 4,
    yaw: Math.atan2(up[0], up[1]),
  };
}
