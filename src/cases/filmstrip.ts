import * as THREE from 'three';
import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { framePoses } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export interface FilmBox {
  id: string;
  world: boolean;
  position: V3;
  rotation: V3;
  size: V3;
  color: string;
}

export interface FilmstripInput {
  model: SimModel;
  recording: Recording;
  boxes: FilmBox[];
  frames: number;
  width: number;
  height: number;
}

export type FilmShot = Omit<FilmstripInput, 'frames' | 'width' | 'height'>;

export const partBox = (p: ScenePart, world: boolean): FilmBox => ({
  id: p.id,
  world,
  position: p.position,
  rotation: p.rotation,
  size: [p.dimensions.width, p.dimensions.height, p.dimensions.depth],
  color: world ? '#0d99ff' : '#9a9a9a',
});

export const filmBoxes = (parts: ScenePart[], world: ScenePart[]): FilmBox[] => [
  ...parts.filter((p) => p.visible && p.role === 'solid').map((p) => partBox(p, false)),
  ...world.map((p) => partBox(p, true)),
];

export type Polygon = Array<[number, number]>;

export interface FilmFrame {
  polygons: Array<{ points: Polygon; color: string; world: boolean }>;
}

const CORNERS: V3[] = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => [x, y, z] as V3)));
const VIEW = new THREE.Vector3(0.9, 0.7, 1.2).normalize();

function project(p: THREE.Vector3): [number, number] {
  const right = new THREE.Vector3(0, 1, 0).cross(VIEW).normalize();
  const up = VIEW.clone().cross(right);

  return [p.dot(right), -p.dot(up)];
}

function hull(points: Polygon): Polygon {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Polygon) =>
    list.reduce<Polygon>((out, p) => {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();

      out.push(p);

      return out;
    }, []);
  const lower = half(sorted);
  const upper = half([...sorted].reverse());

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function boxPolygon(box: FilmBox, delta: THREE.Matrix4 | undefined): Polygon {
  const place = new THREE.Matrix4().compose(
    new THREE.Vector3(...box.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(box.rotation.map(THREE.MathUtils.degToRad) as V3), 'XYZ')),
    new THREE.Vector3(...box.size),
  );

  if (delta) place.premultiply(delta);

  return hull(CORNERS.map((c) => project(new THREE.Vector3(...c).applyMatrix4(place))));
}

export function filmFrames(input: Omit<FilmstripInput, 'width' | 'height'>): FilmFrame[] {
  const { model, recording, boxes, frames } = input;
  const count = Math.max(1, Math.min(frames, recording.frames));

  return Array.from({ length: count }, (_, k) => {
    const at = count === 1 ? 0 : Math.round((k / (count - 1)) * (recording.frames - 1));
    const poses = framePoses(recording, at);
    const parts = simDeltas(model, poses);
    const world = worldDeltas(model, poses);

    return {
      polygons: boxes.map((b) => ({
        points: boxPolygon(b, (b.world ? world : parts).get(b.id)),
        color: b.color,
        world: b.world,
      })),
    };
  });
}

export function frameBounds(frames: FilmFrame[]) {
  const all = frames.flatMap((f) => f.polygons.flatMap((p) => p.points));
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);

  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
