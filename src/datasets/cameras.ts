import * as THREE from 'three';
import { portsOf, worldPort } from '../agent/ports';
import { eulerToMatrix } from '../agent/agentFrame';
import { horizontalDeg, type Lens } from '../cameras/lens';
import { partLens } from '../cameras/optics';
import { isCameraPart } from '../routines/capabilities';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export const FRAME_WIDTH = 640;
export const FRAME_HEIGHT = 480;

const MIN_HFOV = 30;
const MAX_HFOV = 120;
const SCENE_HFOV = 60;
const SCENE_VIEW: V3 = [0.6, 0.7, 1];
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface DatasetCamera {
  key: string;
  label: string;
  part: string | null;
  position: V3;
  target: V3;
  up: V3;
  fovDeg: number;
  lens: Lens;
}

export interface LensPose {
  position: THREE.Vector3;
  axis: THREE.Vector3;
}

const vec = (v: V3) => new THREE.Vector3(...v);
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

export function verticalFov(horizontalDeg: number, aspect = FRAME_WIDTH / FRAME_HEIGHT): number {
  const h = THREE.MathUtils.degToRad(Math.min(MAX_HFOV, Math.max(MIN_HFOV, horizontalDeg)));

  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

export const horizontalFovOf = (part: ScenePart): number => horizontalDeg(partLens(part));

function lensFromBack(part: ScenePart, back: Port[]): LensPose {
  const local = back.reduce((sum, p) => sum.add(vec(p.position)), new THREE.Vector3()).divideScalar(back.length);
  const out = vec(back[0].axis).normalize().negate();
  const dims = [part.dimensions.width, part.dimensions.height, part.dimensions.depth];
  const along = Math.abs(out.dot(new THREE.Vector3(...dims)));

  local.addScaledVector(out, along);

  const front = worldPort(part, { name: 'front', kind: 'face', position: arr(local), axis: arr(out) });

  return { position: vec(front.position), axis: vec(front.axis) };
}

export function lensOf(part: ScenePart): LensPose | null {
  const ports = portsOf(part);
  const lens = ports.find((p) => p.name === 'lens');

  if (lens) {
    const placed = worldPort(part, lens);

    return { position: vec(placed.position), axis: vec(placed.axis).normalize() };
  }

  const back = ports.filter((p) => p.name.startsWith('back'));

  return back.length ? lensFromBack(part, back) : null;
}

function upFor(part: ScenePart, axis: THREE.Vector3): THREE.Vector3 {
  if (Math.abs(axis.dot(WORLD_UP)) < 0.95) return WORLD_UP.clone();

  return new THREE.Vector3(0, 0, -Math.sign(axis.y)).applyMatrix4(eulerToMatrix(part.rotation)).normalize();
}

export const snakeKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'camera';

export function uniqueKey(base: string, taken: Set<string>): string {
  let n = 1;

  while (taken.has(n === 1 ? base : `${base}_${n}`)) n++;

  const key = n === 1 ? base : `${base}_${n}`;

  taken.add(key);

  return key;
}

export function partCameras(parts: ScenePart[], taken = new Set<string>(['scene'])): DatasetCamera[] {
  return parts.filter(isCameraPart).flatMap((part) => {
    const lens = lensOf(part);

    if (!lens) return [];

    return [
      {
        key: uniqueKey(snakeKey(part.name), taken),
        label: part.name,
        part: part.id,
        position: arr(lens.position),
        target: arr(lens.position.clone().addScaledVector(lens.axis, 100)),
        up: arr(upFor(part, lens.axis)),
        fovDeg: verticalFov(horizontalFovOf(part)),
        lens: partLens(part),
      },
    ];
  });
}

function boundsOf(parts: ScenePart[]): THREE.Box3 {
  const box = new THREE.Box3();

  for (const p of parts) {
    const half = Math.max(p.dimensions.width, p.dimensions.height, p.dimensions.depth) / 2;

    box.expandByPoint(vec(p.position).addScalar(half));
    box.expandByPoint(vec(p.position).subScalar(half));
  }

  return box;
}

export function sceneCamera(robot: ScenePart[], world: ScenePart[]): DatasetCamera {
  const box = boundsOf([...robot, ...world]);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const radius = box.isEmpty() ? 200 : Math.max(box.getSize(new THREE.Vector3()).length() / 2, 50);
  const fovDeg = verticalFov(SCENE_HFOV);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(fovDeg / 2))) * 1.05;
  const position = center.clone().addScaledVector(vec(SCENE_VIEW).normalize(), distance);

  return {
    key: 'scene',
    label: 'Scene',
    part: null,
    position: arr(position),
    target: arr(center),
    up: [0, 1, 0],
    fovDeg,
    lens: { model: 'pinhole', hfovDeg: SCENE_HFOV },
  };
}

export const datasetCameras = (robot: ScenePart[], world: ScenePart[]): DatasetCamera[] => [
  sceneCamera(robot, world),
  ...partCameras(robot),
];

export interface PlacedCamera {
  position: V3;
  target: V3;
  up: V3;
}

export function placeCamera(camera: DatasetCamera, delta: THREE.Matrix4 | undefined): PlacedCamera {
  if (!delta) return camera;

  const turn = new THREE.Matrix3().setFromMatrix4(delta);

  return {
    position: arr(vec(camera.position).applyMatrix4(delta)),
    target: arr(vec(camera.target).applyMatrix4(delta)),
    up: arr(vec(camera.up).applyMatrix3(turn).normalize()),
  };
}
