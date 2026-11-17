import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SculptBrushKind } from '../types/robotics';
import { sculptStroke, type SculptStrokeInput } from './sculptStroke';

const BRUSHES: SculptBrushKind[] = ['inflate', 'carve', 'flatten', 'smooth', 'pinch', 'grab'];
const POINTS = [1, 0, 0, 0, 2, 0, 10, 0, 0];
const NORMALS = [1, 0, 0, 0, 0, 1, 0, 1, 0];
const W = (1 + Math.SQRT1_2) / 2;
const A = 0.28 * W * Math.SQRT1_2;
const B = 0.14 * Math.SQRT1_2;
const EXPECTED: Record<SculptBrushKind, number[]> = {
  inflate: [1 + A, A, 0, 0, 2 + B, B],
  carve: [1 - A, -A, 0, 0, 2 - B, -B],
  flatten: [1, 0, 0, 0, 2 - 0.325, 0],
  smooth: [1 - 0.5 * W * 0.225, W * 0.225, 0, 0.5 * 0.5 * 0.225, 2 - 0.5 * 0.225, 0],
  pinch: [1 - W * 0.15, 0.07 * W, 0, 0, 2 - 0.15 + 0.035, 0],
  grab: [1 + 2 * W * 0.55, -W * 0.55, 3 * W * 0.55, 0.55, 2 - 0.275, 0.825],
};

function input(brush: SculptBrushKind, triangles = 1): SculptStrokeInput {
  const geo = new THREE.BufferGeometry();

  geo.setAttribute('position', new THREE.Float32BufferAttribute(Array(triangles).fill(POINTS).flat(), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array(triangles).fill(NORMALS).flat(), 3));

  return {
    geo,
    localHitPoint: new THREE.Vector3(),
    localHitNormal: new THREE.Vector3(0, 2, 0),
    dragDeltaLocal: new THREE.Vector3(2, -1, 3),
    settings: { brush, radiusMm: 4, strength: 0.5, symmetryX: false, symmetryZ: false },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('sculpt brush workspace', () => {
  it.each(BRUSHES)('keeps %s displacements, falloff and untouched vertices', (brush) => {
    const stroke = input(brush);
    const before = [stroke.localHitPoint.toArray(), stroke.localHitNormal.toArray(), stroke.dragDeltaLocal.toArray()];

    sculptStroke(stroke);

    const positions = Array.from(stroke.geo.getAttribute('position').array);

    EXPECTED[brush].forEach((value, i) => expect(positions[i]).toBeCloseTo(value, 6));
    expect(positions.slice(6)).toEqual(POINTS.slice(6));
    expect([stroke.localHitPoint.toArray(), stroke.localHitNormal.toArray(), stroke.dragDeltaLocal.toArray()]).toEqual(
      before,
    );
    expect((stroke.geo.getAttribute('position') as THREE.BufferAttribute).version).toBe(1);
    expect(Array.from(stroke.geo.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
    stroke.geo.dispose();
  });

  it.each([
    ['flatten', 1, 0.65],
    ['smooth', 0.75, 0.45],
    ['pinch', 0.5, 0.3],
    ['grab', 1, 1.1],
  ] as const)('prepares %s strength once across affected vertices and preserves its cap', (brush, limit, factor) => {
    const minimum = vi.spyOn(Math, 'min');

    for (const strength of [0, 0.5, 3]) {
      for (const triangles of [100, 200]) {
        const stroke = input(brush, triangles);
        const blend = Math.min(limit, strength * factor);
        const expected: Record<string, number[]> = {
          flatten: [0, 2 - blend, 0],
          smooth: [0.25 * blend, 2 - 0.5 * blend, 0],
          pinch: [0, 2 - blend + strength * 0.07, 0],
          grab: [blend, 2 - 0.5 * blend, 1.5 * blend],
        };

        stroke.settings.strength = strength;
        minimum.mockClear();
        sculptStroke(stroke);
        expect(minimum).toHaveBeenCalledTimes(1);
        expect(minimum).toHaveBeenCalledWith(limit, strength * factor);

        const positions = Array.from(stroke.geo.getAttribute('position').array);

        expected[brush].forEach((value, axis) => expect(positions[3 + axis]).toBeCloseTo(value, 6));
        expect(positions.slice(6, 9)).toEqual(POINTS.slice(6));
        stroke.geo.dispose();
      }
    }
  });

  it.each(BRUSHES)('keeps %s vector cloning independent of affected vertex count', (brush) => {
    const clone = vi.spyOn(THREE.Vector3.prototype, 'clone');

    for (const triangles of [100, 200]) {
      const stroke = input(brush, triangles);

      clone.mockClear();
      sculptStroke(stroke);
      expect(clone.mock.calls.length).toBeLessThanOrEqual(3);
      stroke.geo.dispose();
    }
  });

  it.each(BRUSHES)('reads only the attributes needed by %s before recomputing normals', (brush) => {
    for (const triangles of [100, 200]) {
      const stroke = input(brush, triangles);
      const position = stroke.geo.getAttribute('position');
      const read = vi.spyOn(position, 'getX');
      const normal = stroke.geo.getAttribute('normal');
      const normalReads = (['getX', 'getY', 'getZ'] as const).map((axis) => vi.spyOn(normal, axis));
      const affected = 2 * triangles;
      const extraPositions = brush === 'smooth' ? affected : 0;
      const neededNormals = brush === 'inflate' || brush === 'carve' ? affected : 0;

      sculptStroke(stroke);
      expect(read).toHaveBeenCalledTimes(2 * position.count + extraPositions);
      normalReads.forEach((normalRead) => expect(normalRead).toHaveBeenCalledTimes(position.count + neededNormals));
      stroke.geo.dispose();
    }
  });

  it.each(BRUSHES)('applies %s to each mirrored region without changing the stroke inputs', (brush) => {
    const stroke = input(brush);
    const geo = new THREE.SphereGeometry(10, 16, 12);

    stroke.geo.dispose();
    stroke.geo = geo;
    stroke.localHitPoint.set(8, 3, 6);
    stroke.localHitNormal.set(8, 3, 6).normalize();
    stroke.settings.symmetryX = true;
    stroke.settings.symmetryZ = true;

    const expected = Array.from(geo.getAttribute('position').array);
    const before = [stroke.localHitPoint.toArray(), stroke.localHitNormal.toArray(), stroke.dragDeltaLocal.toArray()];

    for (const mirror of [new THREE.Vector3(1, 1, 1), new THREE.Vector3(-1, 1, 1), new THREE.Vector3(1, 1, -1)]) {
      const isolated = geo.clone();

      sculptStroke({
        ...stroke,
        geo: isolated,
        localHitPoint: stroke.localHitPoint.clone().multiply(mirror),
        localHitNormal: stroke.localHitNormal.clone().multiply(mirror),
        dragDeltaLocal: stroke.dragDeltaLocal.clone().multiply(mirror),
        settings: { ...stroke.settings, symmetryX: false, symmetryZ: false },
      });
      isolated.getAttribute('position').array.forEach((value, i) => {
        if (value !== geo.getAttribute('position').array[i]) expected[i] = value;
      });
      isolated.dispose();
    }

    sculptStroke(stroke);
    expect(Array.from(geo.getAttribute('position').array)).toEqual(expected);
    expect([stroke.localHitPoint.toArray(), stroke.localHitNormal.toArray(), stroke.dragDeltaLocal.toArray()]).toEqual(
      before,
    );
    geo.dispose();
  });
});
