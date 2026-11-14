import * as THREE from 'three';
import type { DatasetCamera } from '../datasets/cameras';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, partMatrix, poseDeltas, type Rig } from '../utils/kinematics';
import { lensPoint, type Dir } from './lens';

export const SILHOUETTE_SIZE: [number, number] = [128, 96];

export interface Silhouette {
  width: number;
  height: number;
  mask: Uint8Array;
}

export interface SilhouetteScene {
  parts: readonly ScenePart[];
  joints: readonly RobotJoint[];
  view: DatasetCamera;
  size?: [number, number];
}

export type JointDegrees = Record<string, number>;

export type DrawSilhouette = (degrees: JointDegrees, only?: ReadonlySet<string>) => Silhouette;

const RING = 16;
const SPHERE_RINGS = 6;

const boxPoints = (x: number, y: number, z: number): THREE.Vector3[] =>
  [-1, 1].flatMap((i) => [-1, 1].flatMap((j) => [-1, 1].map((k) => new THREE.Vector3(i * x, j * y, k * z))));

const ring = (rx: number, rz: number, y: number): THREE.Vector3[] =>
  Array.from({ length: RING }, (_, i) => {
    const a = (i / RING) * Math.PI * 2;

    return new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz);
  });

function spherePoints(x: number, y: number, z: number): THREE.Vector3[] {
  return Array.from({ length: SPHERE_RINGS + 1 }, (_, r) => {
    const polar = (r / SPHERE_RINGS) * Math.PI - Math.PI / 2;

    return ring(x * Math.cos(polar), z * Math.cos(polar), y * Math.sin(polar));
  }).flat();
}

const ROUND_KINDS = new Set(['cylinder', 'tube']);

function shapePoints(part: ScenePart): THREE.Vector3[] {
  const x = part.dimensions.width / 2;
  const y = part.dimensions.height / 2;
  const z = part.dimensions.depth / 2;

  if (ROUND_KINDS.has(part.kind)) return [...ring(x, z, -y), ...ring(x, z, y)];

  if (part.kind === 'sphere') return spherePoints(x, y, z);

  return boxPoints(x, y, z);
}

const restPoints = (part: ScenePart) => {
  const m = partMatrix(part);

  return shapePoints(part).map((p) => p.applyMatrix4(m));
};

function cameraMatrix(view: DatasetCamera): THREE.Matrix4 {
  const eye = new THREE.Vector3(...view.position);
  const look = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(...view.target), new THREE.Vector3(...view.up));

  return look.setPosition(eye).invert();
}

function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];

    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();

      out.push(p);
    }

    return out.slice(0, -1);
  };

  return [...half(sorted), ...half([...sorted].reverse())];
}

function rowSpan(hull: [number, number][], y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;

  hull.forEach(([ax, ay], i) => {
    const [bx, by] = hull[(i + 1) % hull.length];
    const crosses = (ay <= y && by >= y) || (by <= y && ay >= y);

    if (!crosses || ay === by) return;

    const x = ax + ((y - ay) / (by - ay)) * (bx - ax);

    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  });

  return lo <= hi ? [lo, hi] : null;
}

function fillHull(target: Silhouette, hull: [number, number][]) {
  const { width, height, mask } = target;

  if (hull.length < 3) return;

  const ys = hull.map((p) => p[1]);
  const top = Math.max(0, Math.ceil(Math.min(...ys) - 0.5));
  const bottom = Math.min(height - 1, Math.floor(Math.max(...ys) - 0.5));

  for (let row = top; row <= bottom; row++) {
    const span = rowSpan(hull, row + 0.5);

    if (!span) continue;

    const from = Math.max(0, Math.ceil(span[0] - 0.5));
    const to = Math.min(width - 1, Math.floor(span[1] - 0.5));

    if (to >= from) mask.fill(1, row * width + from, row * width + to + 1);
  }
}

interface Prepared {
  id: string;
  points: THREE.Vector3[];
}

function robotParts(rig: Rig, parts: readonly ScenePart[]): ScenePart[] {
  const robot = rig.joints.map((j) => rig.robotOf.get(j.id)).find(Boolean);

  return parts.filter((p) => p.visible && p.role === 'solid' && (!robot || rig.robotOf.get(p.id) === robot));
}

export function silhouetteDrawer({ parts, joints, view, size = SILHOUETTE_SIZE }: SilhouetteScene): DrawSilhouette {
  const rig = buildRig([...joints], [...parts]);
  const prepared: Prepared[] = robotParts(rig, parts).map((p) => ({ id: p.id, points: restPoints(p) }));
  const toCamera = cameraMatrix(view);
  const [width, height] = size;
  const aspect = width / height;
  const point = new THREE.Vector3();
  const pixel = (dir: Dir): [number, number] | null => {
    const image = lensPoint(view.lens, dir, aspect);

    return image && [((image[0] + 1) / 2) * width, ((1 - image[1]) / 2) * height];
  };

  return (degrees, only) => {
    const out: Silhouette = { width, height, mask: new Uint8Array(width * height) };
    const shown = only ? prepared.filter((p) => only.has(p.id)) : prepared;
    const deltas = poseDeltas(
      rig,
      { values: degrees },
      shown.map((p) => p.id),
    );

    for (const part of shown) {
      const delta = deltas.get(part.id);
      const projected = part.points.flatMap((p) => {
        point.copy(p);

        if (delta) point.applyMatrix4(delta);

        point.applyMatrix4(toCamera);

        const at = pixel([point.x, point.y, point.z]);

        return at ? [at] : [];
      });

      fillHull(out, convexHull(projected));
    }

    return out;
  };
}

export function inside(part: Silhouette, frame: Silhouette): number {
  let shown = 0;
  let within = 0;

  for (let i = 0; i < part.mask.length; i++) {
    shown += part.mask[i];
    within += part.mask[i] & frame.mask[i];
  }

  return shown ? within / shown : 0;
}

export function overlap(a: Silhouette, b: Silhouette): number {
  let both = 0;
  let either = 0;

  for (let i = 0; i < a.mask.length; i++) {
    both += a.mask[i] & b.mask[i];
    either += a.mask[i] | b.mask[i];
  }

  return either ? both / either : 1;
}
