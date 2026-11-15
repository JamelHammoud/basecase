import { describe, expect, it, vi } from 'vitest';
import { hexElement, type Cell } from './hexElement';
import { LAYERED, stiffnessFor } from './material';

const SIZES: Cell[] = [
  [1, 1, 1],
  [0.4, 1.5, 3],
  [4, 0.6, 0.8],
];
const NORMALS: Cell[] = [
  [0, 0, 1],
  [1, 0, 0],
  [1, 2, 3],
  [-2, 1, -0.5],
];

function multiply(matrix: Float64Array, columns: number, vector: Float64Array): Float64Array {
  return Float64Array.from({ length: matrix.length / columns }, (_, r) =>
    vector.reduce((sum, value, j) => sum + matrix[r * columns + j] * value, 0),
  );
}

function affineDisplacement(h: Cell, gradient: number[][]): Float64Array {
  return Float64Array.from({ length: 24 }, (_, i) => {
    const corner = Math.floor(i / 3);
    const row = gradient[i % 3];

    return row.reduce((sum, value, k) => sum + value * (((corner >> k) & 1) * h[k]), 0);
  });
}

function strainOf(gradient: number[][]): Float64Array {
  return Float64Array.from([
    gradient[0][0],
    gradient[1][1],
    gradient[2][2],
    gradient[1][2] + gradient[2][1],
    gradient[0][2] + gradient[2][0],
    gradient[0][1] + gradient[1][0],
  ]);
}

const dot = (a: Float64Array, b: Float64Array) => a.reduce((sum, value, i) => sum + value * b[i], 0);

describe('condensed hex elements', () => {
  it.each(Object.entries(LAYERED))('preserves affine strains and elastic energy for %s', (_, material) => {
    const gradient = [
      [0.03, -0.02, 0.01],
      [0.04, -0.01, 0.02],
      [-0.01, 0.03, 0.05],
    ];
    const strain = strainOf(gradient);

    for (const h of SIZES)
      for (const normal of NORMALS) {
        const c = stiffnessFor(material, normal);
        const saved = c.slice();
        const element = hexElement(h, c);
        const u = affineDisplacement(h, gradient);
        const volume = h[0] * h[1] * h[2];
        const expectedEnergy = volume * dot(strain, multiply(c, 6, strain));

        expect(dot(u, multiply(element.stiffness, 24, u))).toBeCloseTo(expectedEnergy, 10);

        for (const b of element.strains)
          multiply(b, 24, u).forEach((value, i) => expect(value).toBeCloseTo(strain[i], 12));

        element.stiffness.forEach((value, i) =>
          expect(value).toBeCloseTo(element.stiffness[(i % 24) * 24 + Math.floor(i / 24)], 9),
        );
        expect(c).toEqual(saved);
      }
  });

  it('annihilates rigid translations and rotations for anisotropic cells', () => {
    for (const h of SIZES) {
      const element = hexElement(h, stiffnessFor(LAYERED.PLA!, [1, 2, 3]));
      const rotation = affineDisplacement(h, [
        [0, -0.02, 0.03],
        [0.02, 0, -0.01],
        [-0.03, 0.01, 0],
      ]);
      const translation = Float64Array.from({ length: 24 }, (_, i) => [0.01, -0.02, 0.03][i % 3]);

      for (const u of [rotation, translation]) {
        multiply(element.stiffness, 24, u).forEach((value) => expect(value).toBeCloseTo(0, 10));

        for (const b of element.strains) multiply(b, 24, u).forEach((value) => expect(value).toBeCloseTo(0, 12));
      }
    }
  });

  it('reads two material products per integration point and keeps calls independent', () => {
    const c = stiffnessFor(LAYERED.PETG!, [1, -2, 3]);
    const h: Cell = [0.7, 1.2, 2.4];
    let reads = 0;
    const measured = new Proxy(c, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, target);
      },
    });
    const first = hexElement(h, measured);
    const previous = structuredClone(first);

    expect(reads).toBe(8 * 2 * 36);
    expect(first).toEqual(hexElement(h, c));

    c[0] *= 1.5;
    h[1] *= 2;

    const changed = hexElement(h, c);

    expect(changed).not.toEqual(first);
    expect(first).toEqual(previous);
    changed.stiffness.fill(0);
    changed.strains.forEach((b) => b.fill(0));
    expect(first).toEqual(previous);
  });

  it('bounds element storage while reusing weighted strain buffers', () => {
    const c = stiffnessFor(LAYERED.ABS!, [1, 2, -3]);
    const lengths: number[] = [];
    const measured = new Proxy(Float64Array, {
      construct(target, args) {
        const array = Reflect.construct(target, args) as Float64Array;

        lengths.push(array.length);

        return array;
      },
    });

    vi.stubGlobal('Float64Array', measured);

    try {
      const element = hexElement([1, 2, 3], c);

      expect(element.stiffness).toHaveLength(24 * 24);
      expect(element.strains).toHaveLength(8);
      expect(lengths.length).toBeLessThanOrEqual(48);
      expect(lengths.reduce((sum, length) => sum + length, 0)).toBeLessThanOrEqual(6264);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
