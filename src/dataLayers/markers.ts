import * as THREE from 'three';
import {
  MARKER,
  MARKER_DELETE,
  MARKER_DELETE_ALL,
  type FoxglovePrimitive,
  type Marker,
  type RosColor,
  type RosPose,
  type RosVector3,
  type SceneEntity,
} from './messages';
import { addList, addStrip, type Rgba, type ShapeKind, type Shapes } from './shapes';

export type FrameOf = (frame: string) => THREE.Matrix4 | null;

const one = new THREE.Vector3(1, 1, 1);

export const rgba = (c: RosColor): Rgba => [c.r, c.g, c.b, c.a];

export function poseMatrix(pose: RosPose, scale: RosVector3 = one): THREE.Matrix4 {
  const { position: p, orientation: q } = pose;

  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion(q.x, q.y, q.z, q.w),
    new THREE.Vector3(scale.x, scale.y, scale.z),
  );
}

const SOLID: Partial<Record<number, ShapeKind>> = {
  [MARKER.arrow]: 'arrow',
  [MARKER.cube]: 'cube',
  [MARKER.sphere]: 'sphere',
  [MARKER.cylinder]: 'cylinder',
};

const LISTED: Partial<Record<number, ShapeKind>> = {
  [MARKER.cubeList]: 'cube',
  [MARKER.sphereList]: 'sphere',
  [MARKER.points]: 'sphere',
};

function addListed(shapes: Shapes, marker: Marker, at: THREE.Matrix4, kind: ShapeKind) {
  const { scale } = marker;
  const size = marker.type === MARKER.points ? { x: scale.x, y: scale.y || scale.x, z: scale.x } : scale;

  (marker.points ?? []).forEach((p, i) => {
    const matrix = at
      .clone()
      .multiply(
        new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(size.x, size.y, size.z),
        ),
      );

    shapes[kind].push({ matrix, color: rgba(marker.colors?.[i] ?? marker.color) });
  });
}

export function addMarker(shapes: Shapes, marker: Marker, frameOf: FrameOf): string | null {
  if (marker.action === MARKER_DELETE || marker.action === MARKER_DELETE_ALL) return null;

  const frame = frameOf(marker.header.frame_id);

  if (!frame) return marker.header.frame_id;

  const solid = SOLID[marker.type];

  if (solid) {
    shapes[solid].push({
      matrix: frame.clone().multiply(poseMatrix(marker.pose, marker.scale)),
      color: rgba(marker.color),
    });

    return null;
  }

  const at = frame.clone().multiply(poseMatrix(marker.pose));
  const listed = LISTED[marker.type];

  if (listed) addListed(shapes, marker, at, listed);
  else if (marker.type === MARKER.lineStrip) addStrip(shapes, at, marker.points ?? [], rgba(marker.color));
  else if (marker.type === MARKER.lineList) addList(shapes, at, marker.points ?? [], rgba(marker.color));

  return null;
}

export function liveMarkers(markers: Marker[]): Marker[] {
  const kept = new Map<string, Marker>();

  for (const m of markers) {
    if (m.action === MARKER_DELETE_ALL) kept.clear();
    else if (m.action === MARKER_DELETE) kept.delete(`${m.ns}/${m.id}`);
    else kept.set(`${m.ns}/${m.id}`, m);
  }

  return [...kept.values()];
}

const LINE_LOOP = 1;
const LINE_LIST = 2;

function addPrimitives(shapes: Shapes, at: THREE.Matrix4, kind: ShapeKind, list: FoxglovePrimitive[] | undefined) {
  for (const p of list ?? []) {
    shapes[kind].push({ matrix: at.clone().multiply(poseMatrix(p.pose, p.size)), color: rgba(p.color) });
  }
}

export function addEntity(shapes: Shapes, entity: SceneEntity, frameOf: FrameOf): string | null {
  const at = frameOf(entity.frame_id);

  if (!at) return entity.frame_id;

  addPrimitives(shapes, at, 'cube', entity.cubes);
  addPrimitives(shapes, at, 'sphere', entity.spheres);
  addPrimitives(shapes, at, 'cylinder', entity.cylinders);
  addPrimitives(
    shapes,
    at,
    'arrow',
    entity.arrows?.map((a) => ({ ...a, size: a.size ?? { x: a.shaft_length ?? 0.3, y: 0.02, z: 0.02 } })),
  );

  for (const line of entity.lines ?? []) {
    const placed = at.clone().multiply(poseMatrix(line.pose));
    const points = line.type === LINE_LOOP && line.points.length ? [...line.points, line.points[0]] : line.points;
    const add = line.type === LINE_LIST ? addList : addStrip;

    add(shapes, placed, points, rgba(line.color));
  }

  return null;
}
