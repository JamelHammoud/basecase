import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SweepRequest } from '../../utils/engineeringTypes';
import { seededRandom } from '../../utils/seededRandom';
import { place } from './collide';
import { ShapeSolid } from './shapeSolid';
import { sweepClashes } from './sweep';
import { prepareSweepRotation } from './sweepRotation';

function previousRotation(spec: Pick<SweepRequest, 'origin' | 'axis'>, angle: number) {
  const origin = new THREE.Vector3(...spec.origin);
  const axis = new THREE.Vector3(...spec.axis).normalize();

  return new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(angle)))
    .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
}

describe('prepared sweep rotations', () => {
  it('retains exact matrix arithmetic across translated pivots, scaled axes and repeated angles', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');
    const vector = (): [number, number, number] => [random() * 200 - 100, random() * 200 - 100, random() * 200 - 100];

    for (let i = 0; i < 100; i++) {
      const spec = { origin: vector(), axis: vector() };
      const before = structuredClone(spec);
      const rotationAt = prepareSweepRotation(spec);

      for (const angle of [0, -180, 360, -45, 90, 0, random() * 720 - 360]) {
        expect(rotationAt(angle)).toEqual(previousRotation(spec, angle));
      }

      expect(spec).toEqual(before);
    }

    for (const value of [0, -0, 1e-200, 1e200, Infinity, NaN]) {
      const spec = { origin: vector(), axis: [value, 0, 0] as [number, number, number] };

      expect(prepareSweepRotation(spec)(45)).toEqual(previousRotation(spec, 45));
    }
  });

  it.each([300, 600])('prepares the pivot only once across %i angles', (count) => {
    const spec = { origin: [3, -4, 8], axis: [2, 7, -1] } satisfies Pick<SweepRequest, 'origin' | 'axis'>;
    const normalize = vi.spyOn(THREE.Vector3.prototype, 'normalize');
    const translation = vi.spyOn(THREE.Matrix4.prototype, 'makeTranslation');

    try {
      const rotationAt = prepareSweepRotation(spec);
      const matrices = new Set<THREE.Matrix4>();

      for (let i = 0; i < count; i++) matrices.add(rotationAt(i));

      expect(matrices.size).toBe(1);
      expect(normalize).toHaveBeenCalledTimes(1);
      expect(translation).toHaveBeenCalledTimes(2);
      normalize.mockClear();
      translation.mockClear();

      for (let i = 0; i < count; i++) previousRotation(spec, i);

      expect(normalize).toHaveBeenCalledTimes(count);
      expect(translation).toHaveBeenCalledTimes(count * 2);
    } finally {
      normalize.mockRestore();
      translation.mockRestore();
    }
  });

  it('keeps independent workspaces and reads edited pivots on the next preparation', () => {
    const spec = { origin: [3, -4, 8], axis: [2, 7, -1] } satisfies Pick<SweepRequest, 'origin' | 'axis'>;
    const original = structuredClone(spec);
    const first = prepareSweepRotation(spec);
    const saved = first(45).clone();

    spec.origin[0] = 25;
    spec.axis[1] = -3;

    const second = prepareSweepRotation(spec);

    expect(second(45)).toEqual(previousRotation(spec, 45));
    expect(first(45)).toEqual(saved);
    expect(first(90)).toEqual(previousRotation(original, 90));
    expect(second(90)).not.toBe(first(90));
    expect(saved).toEqual(previousRotation(original, 45));
  });

  it('retains complete clash and floor reports across a multi-angle sweep without editing placements', () => {
    const geometry = new THREE.BoxGeometry(8, 8, 8).toNonIndexed();
    const solid = new ShapeSolid(new Float32Array(geometry.attributes.position.array));
    const scene = [
      place('moving', solid, new THREE.Matrix4().makeTranslation(15, 10, 0)),
      place('obstacle', solid, new THREE.Matrix4().makeTranslation(2, 23, 1)),
    ];
    const spec: SweepRequest = {
      moving: ['moving'],
      origin: [0, 10, 0],
      axis: [0, 0, 3],
      anglesDeg: [0, 90, -90, 180, 45, 90],
    };
    const matrices = scene.map((part) => part.matrix.clone());

    try {
      const expected = spec.anglesDeg.flatMap((angle) => sweepClashes(scene, { ...spec, anglesDeg: [angle] }));

      expect(expected.some((hit) => hit.b === 'floor')).toBe(true);
      expect(expected.some((hit) => hit.b === 'obstacle')).toBe(true);
      expect(sweepClashes(scene, spec)).toEqual(expected);
      expect(scene.map((part) => part.matrix)).toEqual(matrices);
      expect(sweepClashes(scene, { ...spec, anglesDeg: [] })).toEqual([]);
    } finally {
      geometry.dispose();
      solid.dispose();
    }
  });
});
