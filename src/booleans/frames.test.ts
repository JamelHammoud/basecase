import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BooleanFrame, BooleanOp, ScenePart } from '../types/robotics';
import { syncFrames } from './frames';
import { booleanPart, isBooleanPart, type BooleanPart, type Vec3 } from './parts';

const round = (value: number) => Math.round(value * 1e4) / 1e4 + 0;
const quaternion = (angles: Vec3) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...(angles.map(THREE.MathUtils.degToRad) as Vec3), 'XYZ'));
const dimensions = (part: ScenePart) => [part.dimensions.width, part.dimensions.height, part.dimensions.depth];

function formerMove(operand: ScenePart, frame: BooleanFrame, part: ScenePart): ScenePart {
  const inverse = quaternion(frame.rotation).invert();
  const target = quaternion(part.rotation);
  const before = [frame.dimensions.width, frame.dimensions.height, frame.dimensions.depth];
  const scale = new THREE.Vector3(...dimensions(part).map((value, i) => (before[i] > 1e-6 ? value / before[i] : 1)));
  const position = new THREE.Vector3(...operand.position)
    .sub(new THREE.Vector3(...frame.position))
    .applyQuaternion(inverse)
    .multiply(scale)
    .applyQuaternion(target)
    .add(new THREE.Vector3(...part.position));
  const own = quaternion(operand.rotation);
  const rotation = target.clone().multiply(inverse).multiply(own);
  const local = inverse.multiply(own);
  const factors = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((axis) =>
    axis.applyQuaternion(local).multiply(scale).length(),
  );
  const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');

  return {
    ...operand,
    position: position.toArray().map(round) as Vec3,
    rotation: [euler.x, euler.y, euler.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 1000) / 1000 + 0) as Vec3,
    dimensions: {
      ...operand.dimensions,
      width: round(operand.dimensions.width * factors[0]),
      height: round(operand.dimensions.height * factors[1]),
      depth: round(operand.dimensions.depth * factors[2]),
    },
  };
}

function formerSync(part: ScenePart): ScenePart {
  if (!isBooleanPart(part) || !part.boolean.frame) return part;

  const operands = part.boolean.operands.map((operand) => formerSync(formerMove(operand, part.boolean.frame!, part)));

  return {
    ...part,
    boolean: {
      ...part.boolean,
      operands,
      frame: { position: part.position, rotation: part.rotation, dimensions: part.dimensions },
    },
  };
}

function fixture(index: number): ScenePart {
  return {
    id: `operand-${index}`,
    name: 'Box',
    kind: 'box',
    category: 'primitives',
    role: index % 2 ? 'cutout' : 'solid',
    position: [index * 3.7, 12 - index, index / 3],
    rotation: [index * 13, -index * 17, index * 31],
    dimensions: { width: 12, height: 7, depth: 23 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
  };
}

function assembly(op: BooleanOp, nested = false): BooleanPart {
  const base = fixture(0);
  const tools = Array.from({ length: 31 }, (_, i) => fixture(i + 1));

  if (nested) tools.push(assembly(op));

  const part = booleanPart({ id: 'assembly', base, tools, op });
  const frame = { position: part.position, rotation: [17, -29, 43] as Vec3, dimensions: part.dimensions };

  return {
    ...part,
    position: [28, -45, 13],
    rotation: [-71, 35, 113],
    dimensions: { width: 24, height: 21, depth: 11.5 },
    boolean: { ...part.boolean, frame },
  };
}

describe('boolean frame transforms', () => {
  it.each(['union', 'subtract', 'intersect'] as const)('preserves %s operands through nested edits', (op) => {
    const source = assembly(op, true);
    const snapshot = structuredClone(source);
    const result = syncFrames(source) as BooleanPart;

    expect(result).toEqual(formerSync(source));
    expect(source).toEqual(snapshot);
    expect(syncFrames(result)).toBe(result);

    const resized = { ...result, position: [-4, 7, 12] as Vec3, dimensions: { width: 12, height: 9, depth: 23 } };

    expect(syncFrames(resized)).toEqual(formerSync(resized));
    expect(syncFrames(source)).toEqual(result);
  });

  it('prepares one inverse per changed group and preserves rigid dimensions', () => {
    const source = assembly('subtract');
    const rigid = { ...source, dimensions: source.boolean.frame!.dimensions };
    const invert = vi.spyOn(THREE.Quaternion.prototype, 'invert');
    let result: BooleanPart;

    try {
      result = syncFrames(rigid) as BooleanPart;
      expect(invert).toHaveBeenCalledTimes(1);
      expect(syncFrames(result)).toBe(result);
      expect(invert).toHaveBeenCalledTimes(1);
    } finally {
      invert.mockRestore();
    }

    for (const [i, operand] of result.boolean.operands.entries()) {
      const expected = formerMove(rigid.boolean.operands[i], rigid.boolean.frame!, rigid);

      expect(operand.position).toEqual(expected.position);
      expect(operand.rotation).toEqual(expected.rotation);
      expect(operand.dimensions).toBe(rigid.boolean.operands[i].dimensions);
    }
  });
});
