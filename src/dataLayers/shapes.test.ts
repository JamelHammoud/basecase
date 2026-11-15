import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { addList, addSegment, addStrip, emptyShapes, type LinePoint, type Rgba } from './shapes';

const color: Rgba = [0.1, 0.4, 0.8, 0.3];
const points: LinePoint[] = [
  { x: 1, y: 2, z: 3 },
  { x: -4, y: 5, z: 6 },
  { x: -4, y: 5, z: 6 },
  { x: 7, y: -8, z: 9 },
  { x: 10, y: 11, z: -12 },
];
const matrices = [
  new THREE.Matrix4(),
  new THREE.Matrix4().compose(
    new THREE.Vector3(20, -30, 40),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 1.2)),
    new THREE.Vector3(-2, 3, 0.5),
  ),
  new THREE.Matrix4().set(1, 0.2, 0.3, 4, 0.4, 2, 0.5, 6, 0.6, 0.7, 3, 8, 0.01, 0.02, 0.03, 1),
];

function expected(matrix: THREE.Matrix4, input: LinePoint[], step: number) {
  const lines: number[] = [];
  const colors: number[] = [];

  for (let i = 1; i < input.length; i += step) {
    for (const point of [input[i - 1], input[i]]) {
      lines.push(...new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(matrix).toArray());
      colors.push(...color.slice(0, 3));
    }
  }

  return { lines, lineColors: colors };
}

describe('sensor line geometry', () => {
  it('preserves exact strip and list coordinates, colors and inputs across transforms', () => {
    const input = structuredClone(points);

    for (const matrix of matrices) {
      const original = matrix.elements.slice();

      for (let length = 0; length <= input.length; length++) {
        const subset = input.slice(0, length);
        const strip = emptyShapes();
        const list = emptyShapes();

        addStrip(strip, matrix, subset, color);
        addList(list, matrix, subset, color);
        expect(strip).toMatchObject(expected(matrix, subset, 1));
        expect(list).toMatchObject(expected(matrix, subset, 2));
      }

      expect(matrix.elements).toEqual(original);
    }

    expect(input).toEqual(points);
    expect(color).toEqual([0.1, 0.4, 0.8, 0.3]);
  });

  it('appends independent draws without retaining a previous strip endpoint', () => {
    const shapes = emptyShapes();
    const first = expected(matrices[1], points, 1);
    const second = expected(matrices[2], points.slice(0, 2), 1);

    addStrip(shapes, matrices[1], points, color);
    addStrip(shapes, matrices[0], [], color);
    addSegment(shapes, matrices[2], [points[0], points[1]], color);
    expect(shapes.lines).toEqual([...first.lines, ...second.lines]);
    expect(shapes.lineColors).toEqual([...first.lineColors, ...second.lineColors]);
  });

  it('transforms each strip vertex once and ignores unpaired list endpoints', () => {
    const transform = vi.spyOn(THREE.Vector3.prototype, 'applyMatrix4');
    const input = Array.from({ length: 600 }, (_, i) => ({ x: i, y: i % 7, z: -i }));

    try {
      addStrip(emptyShapes(), matrices[1], input, color);
      expect(transform).toHaveBeenCalledTimes(input.length);
      transform.mockClear();
      addStrip(emptyShapes(), matrices[1], input.slice(0, 1), color);
      expect(transform).not.toHaveBeenCalled();
      addList(emptyShapes(), matrices[1], input.slice(0, 599), color);
      expect(transform).toHaveBeenCalledTimes(598);
    } finally {
      transform.mockRestore();
    }
  });
});
