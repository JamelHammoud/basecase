import * as THREE from 'three';
import type { BooleanFrame, PartDimensions, ScenePart } from '../types/robotics';
import { isBooleanPart, sameVec, type BooleanPart, type Vec3 } from './parts';
import { quaternionOf } from './rotation';
import { keepsShape, stretchOf } from './stretch';

const degrees = (q: THREE.Quaternion): Vec3 =>
  new THREE.Euler()
    .setFromQuaternion(q, 'XYZ')
    .toArray()
    .slice(0, 3)
    .map((r) => Math.round(THREE.MathUtils.radToDeg(r as number) * 1000) / 1000 + 0) as Vec3;

const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

const sizeOf = (d: PartDimensions): Vec3 => [d.width, d.height, d.depth];

const sameFrame = (frame: BooleanFrame, part: ScenePart) =>
  sameVec(frame.position, part.position) &&
  sameVec(frame.rotation, part.rotation) &&
  sameVec(sizeOf(frame.dimensions), sizeOf(part.dimensions));

interface Delta {
  from: { position: THREE.Vector3; rotation: THREE.Quaternion };
  to: { position: THREE.Vector3; rotation: THREE.Quaternion };
  scale: THREE.Vector3;
  scaled: boolean;
}

function deltaOf(frame: BooleanFrame, part: ScenePart): Delta {
  const before = sizeOf(frame.dimensions);
  const after = sizeOf(part.dimensions);
  const scale = new THREE.Vector3(...before.map((b, i) => (b > 1e-6 ? after[i] / b : 1)));

  return {
    from: { position: new THREE.Vector3(...frame.position), rotation: quaternionOf(frame.rotation) },
    to: { position: new THREE.Vector3(...part.position), rotation: quaternionOf(part.rotation) },
    scale,
    scaled: !sameVec(scale.toArray(), [1, 1, 1]),
  };
}

function scaledDimensions(operand: ScenePart, local: THREE.Quaternion, scale: THREE.Vector3): PartDimensions {
  const factors = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((axis) =>
    axis.applyQuaternion(local).multiply(scale).length(),
  );
  const d = operand.dimensions;

  return {
    ...d,
    width: round(d.width * factors[0]),
    height: round(d.height * factors[1]),
    depth: round(d.depth * factors[2]),
  };
}

function moveOperand(operand: ScenePart, delta: Delta): ScenePart {
  const inverse = delta.from.rotation.clone().invert();
  const local = new THREE.Vector3(...operand.position).sub(delta.from.position).applyQuaternion(inverse);
  const position = local.multiply(delta.scale).applyQuaternion(delta.to.rotation).add(delta.to.position);
  const own = quaternionOf(operand.rotation);
  const rotation = delta.to.rotation.clone().multiply(inverse).multiply(own);
  const dimensions =
    delta.scaled && !keepsShape(operand)
      ? scaledDimensions(operand, inverse.multiply(own), delta.scale)
      : operand.dimensions;

  return { ...operand, position: position.toArray().map(round) as Vec3, rotation: degrees(rotation), dimensions };
}

const SIZE_KEYS = ['width', 'height', 'depth'] as const;

function withinStretch(part: BooleanPart, frame: BooleanFrame): BooleanPart {
  const { fixed } = stretchOf(part);
  const held = SIZE_KEYS.filter((key, i) => fixed[i] && part.dimensions[key] !== frame.dimensions[key]);

  if (held.length === 0) return part;

  const kept = Object.fromEntries(held.map((key) => [key, frame.dimensions[key]]));

  return { ...part, dimensions: { ...part.dimensions, ...kept } };
}

function followFrame(edited: BooleanPart): BooleanPart {
  const { frame } = edited.boolean;

  if (!frame || sameFrame(frame, edited)) return edited;

  const part = withinStretch(edited, frame);

  if (sameFrame(frame, part)) return part;

  const delta = deltaOf(frame, part);
  const operands = part.boolean.operands.map((o) => moveOperand(o, delta));
  const next = { position: part.position, rotation: part.rotation, dimensions: part.dimensions };

  return { ...part, boolean: { ...part.boolean, operands, frame: next } };
}

export function syncFrames(part: ScenePart): ScenePart {
  if (!isBooleanPart(part)) return part;

  const followed = followFrame(part);
  const operands = followed.boolean.operands.map(syncFrames);
  const same = operands.every((o, i) => o === followed.boolean.operands[i]);

  return same ? followed : { ...followed, boolean: { ...followed.boolean, operands } };
}
