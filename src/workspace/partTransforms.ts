import * as THREE from 'three';
import { hardwareColor, hardwareDimensions, hardwareName, hardwareNote, type HardwareSpec } from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import { halfExtents, selectionBounds, type Axis } from '../utils/selection';
import type { Vec3 } from './types';

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const MOVE_EPSILON = 1e-6;

const movable = (ids: Set<string>) => (p: ScenePart) => ids.has(p.id) && !p.locked;

const withY = (p: ScenePart, y: number): ScenePart => ({ ...p, position: [p.position[0], y, p.position[2]] });

export function dropToFloor(prev: ScenePart[], ids: Set<string>): ScenePart[] {
  const canMove = movable(ids);
  const sel = prev.filter(canMove);

  if (sel.length > 1 && sel.every((p) => p.group)) {
    const lift = -selectionBounds(sel).min[1];

    return prev.map((p) => (canMove(p) ? withY(p, round2(p.position[1] + lift)) : p));
  }

  return prev.map((p) => (canMove(p) ? withY(p, round2(halfExtents(p)[1])) : p));
}

const axisVector = (axis: Axis) => new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);

const degrees = (rad: number) => round1(THREE.MathUtils.radToDeg(rad)) || 0;

export function rotateQuarterTurn(prev: ScenePart[], ids: Set<string>, axis: Axis): ScenePart[] {
  const sel = prev.filter((p) => ids.has(p.id));

  if (sel.length === 0) return prev;

  const { min, max } = selectionBounds(sel);
  const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const turn = new THREE.Quaternion().setFromAxisAngle(axisVector(axis), Math.PI / 2);

  return prev.map((p) => {
    if (!ids.has(p.id) || p.locked) return p;

    const pos = new THREE.Vector3(...p.position).sub(center).applyQuaternion(turn).add(center);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...(p.rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'),
    );
    const e = new THREE.Euler().setFromQuaternion(turn.clone().multiply(q), 'XYZ');

    return {
      ...p,
      position: [round2(pos.x), round2(pos.y), round2(pos.z)],
      rotation: [degrees(e.x), degrees(e.y), degrees(e.z)],
    };
  });
}

export function moveSelectionTo(
  prev: ScenePart[],
  ids: Set<string>,
  target: Partial<Record<Axis, number>>,
  live?: boolean,
): ScenePart[] {
  const sel = prev.filter((p) => ids.has(p.id));

  if (sel.length === 0) return prev;

  const { min, max } = selectionBounds(sel);
  const delta = ([0, 1, 2] as Axis[]).map((a) => (target[a] === undefined ? 0 : target[a] - (min[a] + max[a]) / 2));

  if (delta.every((d) => Math.abs(d) < MOVE_EPSILON) && live) return prev;

  const canMove = movable(ids);

  return prev.map((p) =>
    canMove(p)
      ? {
          ...p,
          position: [
            round2(p.position[0] + delta[0]),
            round2(p.position[1] + delta[1]),
            round2(p.position[2] + delta[2]),
          ],
        }
      : p,
  );
}

const overlapsXZ = (part: ScenePart, other: ScenePart) =>
  Math.abs(part.position[0] - other.position[0]) <= part.dimensions.width / 2 + other.dimensions.width / 2 &&
  Math.abs(part.position[2] - other.position[2]) <= part.dimensions.depth / 2 + other.dimensions.depth / 2;

const isSupport = (part: ScenePart) => (other: ScenePart) =>
  other.id !== part.id && other.visible && other.role === 'solid' && overlapsXZ(part, other);

export function stackedPosition(part: ScenePart, parts: ScenePart[]): Vec3 {
  const surface = parts
    .filter(isSupport(part))
    .reduce((top, other) => Math.max(top, other.position[1] + other.dimensions.height / 2), 0);

  return [part.position[0], round1(surface + part.dimensions.height / 2), part.position[2]];
}

export function withHardware(p: ScenePart, spec: HardwareSpec): ScenePart {
  if (!p.hardware) return p;

  const dims = hardwareDimensions(spec);
  const bottom = p.position[1] - p.dimensions.height / 2;

  return {
    ...p,
    hardware: spec,
    dimensions: dims,
    position: [p.position[0], round2(bottom + dims.height / 2), p.position[2]],
    name: p.name === hardwareName(p.hardware) ? hardwareName(spec) : p.name,
    note: !p.note || p.note === hardwareNote(p.hardware) ? hardwareNote(spec) : p.note,
    color: p.color.toLowerCase() === hardwareColor(p.hardware).toLowerCase() ? hardwareColor(spec) : p.color,
  };
}
