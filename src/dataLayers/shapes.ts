import * as THREE from 'three';

export const SHAPE_KINDS = ['cube', 'sphere', 'cylinder', 'arrow'] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type Rgba = [number, number, number, number];

export interface ShapeInstance {
  matrix: THREE.Matrix4;
  color: Rgba;
}

export interface Shapes {
  cube: ShapeInstance[];
  sphere: ShapeInstance[];
  cylinder: ShapeInstance[];
  arrow: ShapeInstance[];
  lines: number[];
  lineColors: number[];
}

export const emptyShapes = (): Shapes => ({ cube: [], sphere: [], cylinder: [], arrow: [], lines: [], lineColors: [] });

export const shapeCount = (s: Shapes) => SHAPE_KINDS.reduce((n, k) => n + s[k].length, 0);

export const segmentCount = (s: Shapes) => s.lines.length / 6;

export interface LinePoint {
  x: number;
  y: number;
  z: number;
}

const scratch = new THREE.Vector3();

function appendPoint(shapes: Shapes, color: Rgba) {
  shapes.lines.push(scratch.x, scratch.y, scratch.z);
  shapes.lineColors.push(color[0], color[1], color[2]);
}

function transformPoint(shapes: Shapes, matrix: THREE.Matrix4, point: LinePoint, color: Rgba) {
  scratch.set(point.x, point.y, point.z).applyMatrix4(matrix);
  appendPoint(shapes, color);
}

export function addSegment(shapes: Shapes, matrix: THREE.Matrix4, ends: [LinePoint, LinePoint], color: Rgba) {
  for (const end of ends) transformPoint(shapes, matrix, end, color);
}

export function addStrip(shapes: Shapes, matrix: THREE.Matrix4, points: LinePoint[], color: Rgba) {
  if (points.length < 2) return;

  scratch.set(points[0].x, points[0].y, points[0].z).applyMatrix4(matrix);

  for (let i = 1; i < points.length; i++) {
    appendPoint(shapes, color);
    transformPoint(shapes, matrix, points[i], color);
  }
}

export function addList(shapes: Shapes, matrix: THREE.Matrix4, points: LinePoint[], color: Rgba) {
  for (let i = 1; i < points.length; i += 2) {
    transformPoint(shapes, matrix, points[i - 1], color);
    transformPoint(shapes, matrix, points[i], color);
  }
}
