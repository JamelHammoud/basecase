import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../utils/seededRandom';
import { prepareLineDistance } from './lineDistance';

const previousDistance = (line: THREE.Line3, point: THREE.Vector3) =>
  line.closestPointToPoint(point, false, new THREE.Vector3()).distanceTo(point);

describe('prepared line distances', () => {
  it('matches unbounded Three projections exactly across translated, reversed and scaled lines', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');
    const vector = () => new THREE.Vector3(...Array.from({ length: 3 }, () => (random() - 0.5) * 2000));

    for (let i = 0; i < 120; i++) {
      const line = new THREE.Line3(vector(), vector());
      const before = line.clone();
      const distance = prepareLineDistance(line);

      for (let j = 0; j < 100; j++) {
        const point = vector();
        const original = point.clone();

        expect(distance(point)).toBe(previousDistance(line, point));
        expect(point).toEqual(original);
      }

      expect(line).toEqual(before);
    }
  });

  it('preserves degenerate, nonfinite and extreme projections', () => {
    const values = [0, -0, 1e-200, 1e200, Infinity, -Infinity, NaN];
    const points = values.map((x) => new THREE.Vector3(x, 2, -3));

    for (const value of values) {
      const start = new THREE.Vector3(value, 0, 0);
      const ends = [start.clone(), new THREE.Vector3(0, value, 1)];

      for (const end of ends) {
        const line = new THREE.Line3(start, end);
        const distance = prepareLineDistance(line);

        for (const point of points) expect(distance(point)).toBe(previousDistance(line, point));
      }
    }
  });

  it('owns its preparation and reads changed lines on a later preparation', () => {
    const line = new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const point = new THREE.Vector3(3, 2, 4);
    const first = prepareLineDistance(line);

    expect(first(point)).toBe(5);
    line.start.set(10, 2, -4);
    line.end.set(11, 3, -2);

    const second = prepareLineDistance(line);

    expect(second(point)).toBe(previousDistance(line, point));
    expect(first(point)).toBe(5);
    expect(second(point)).toBe(previousDistance(line, point));
  });

  it.each([300, 600])('prepares the squared length once across %i probes', (count) => {
    const line = new THREE.Line3(new THREE.Vector3(3, -4, 8), new THREE.Vector3(5, 7, -2));
    const points = Array.from({ length: count }, (_, i) => new THREE.Vector3(i / 7, -i / 5, i / 11));
    const dot = vi.spyOn(THREE.Vector3.prototype, 'dot');

    try {
      const distance = prepareLineDistance(line);
      const actual = points.map(distance);

      expect(dot).toHaveBeenCalledTimes(count + 1);
      dot.mockClear();

      const expected = points.map((point) => previousDistance(line, point));

      expect(dot).toHaveBeenCalledTimes(count * 2);
      expect(actual).toEqual(expected);
    } finally {
      dot.mockRestore();
    }
  });
});
