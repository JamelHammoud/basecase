import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ShapeSolid } from './shapeSolid';
import { visibleShares } from './visibility';

const matrix = (x: number, y: number, z: number, turn: number) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(turn, turn / 2, turn / 3)),
    new THREE.Vector3(1, 1.3, 0.7),
  );

function boxSolid() {
  const geometry = new THREE.BoxGeometry(20, 30, 40);
  const triangles = geometry.toNonIndexed();
  const solid = new ShapeSolid(triangles.getAttribute('position').array as Float32Array);

  geometry.dispose();
  triangles.dispose();

  return solid;
}

function sampled(points: number[]) {
  const solid = new ShapeSolid(new Float32Array());

  solid.samples.set(-4000, new Float32Array(points));

  return solid;
}

const sharesFor = (matrices: THREE.Matrix4[], solid = boxSolid()) =>
  visibleShares(matrices.map((matrix, i) => ({ id: String(i), solid, matrix })));

afterEach(() => vi.restoreAllMocks());

describe('visible shares', () => {
  it('keeps exact shares for overlapping, rotated, scaled and far-translated meshes', () => {
    expect(sharesFor([matrix(0, 0, 0, 0), matrix(5, 10, 8, 0.7), matrix(-20, 0, 0, 1.1)])).toEqual({
      0: 0.18085836141847356,
      1: 0.41146470219809717,
      2: 0.4076769363834293,
    });
    expect(sharesFor([matrix(1e6, -1e6, 2e6, 1), matrix(1e6 + 12, -1e6 - 4, 2e6 + 5, 2)])).toEqual({
      0: 0.4723325571839474,
      1: 0.5276674428160526,
    });
    expect(sharesFor([matrix(0, 0, 0, 0), matrix(0, 0, 0, 0)])).toEqual({ 0: 1, 1: 0 });
  });

  it('counts both depth directions and the upper view without retaining previous view winners', () => {
    const solid = sampled([0, 0, 0]);
    const matrices = [-1, 0, 1].map((z) => new THREE.Matrix4().makeTranslation(0, 0, z));

    expect(sharesFor(matrices, solid)).toEqual({ 0: 4 / 11, 1: 3 / 11, 2: 4 / 11 });
    expect(sharesFor([...matrices].reverse(), solid)).toEqual({ 0: 4 / 11, 1: 3 / 11, 2: 4 / 11 });
    expect(sharesFor([new THREE.Matrix4(), new THREE.Matrix4()], solid)).toEqual({ 0: 1, 1: 0 });
  });

  it('handles empty and zero-area meshes and collapsed projection ranges', () => {
    const empty = new ShapeSolid(new Float32Array());
    const degenerate = new ShapeSolid(new Float32Array(9));

    expect(visibleShares([])).toEqual({});
    expect(sharesFor([new THREE.Matrix4()], empty)).toEqual({ 0: 0 });
    expect(sharesFor([new THREE.Matrix4()], degenerate)).toEqual({ 0: 0 });
    expect(sharesFor([new THREE.Matrix4()], sampled([3, 3, 3]))).toEqual({ 0: 1 });
    expect(sharesFor([new THREE.Matrix4()], sampled([0, 0, 0, 1e-8, 0, 0]))).toEqual({ 0: 1 });
  });

  it('retains owners and local caches across mixed sample lengths and changed placements', () => {
    const parts = [[], [0, 1, 2, 3, 4, 5], [], [6, 7, 8], [9, 10, 11, -1, -2, -3, 4, 5, 6]].map((points, i) => ({
      id: String(i),
      solid: sampled(points),
      matrix: matrix(i * 3, i * -2, i, i / 4),
    }));
    const saved = parts.map((part) => part.solid.samples.get(-4000)!.slice());
    const point = new THREE.Vector3();

    for (let pass = 0; pass < 2; pass++) {
      const expected = parts.map((part, i) => {
        const world = saved[i].slice();

        for (let at = 0; at < world.length; at += 3)
          point.fromArray(saved[i], at).applyMatrix4(part.matrix).toArray(world, at);

        return { id: part.id, solid: sampled(Array.from(world)), matrix: new THREE.Matrix4() };
      });

      expect(visibleShares(parts)).toEqual(visibleShares(expected));

      parts.forEach((part, i) => {
        expect(part.solid.samples.get(-4000)).toEqual(saved[i]);
        part.matrix.premultiply(matrix(-10, 20, 5, 0.8));
      });
    }
  });

  it.each([1, 2])('prepares bounds once and reads projection limits outside the sample loop for %i meshes', (count) => {
    const solid = boxSolid();
    const matrices = Array.from({ length: count }, (_, i) => matrix(i * 10, 0, 0, i));
    const before = sharesFor(matrices, solid);
    const samples = solid.samples.get(-4000)!;
    const saved = samples.slice();
    const bounds = vi.spyOn(THREE.Box3.prototype, 'setFromArray');
    const components = vi.spyOn(THREE.Vector3.prototype, 'getComponent');
    const copies = vi.spyOn(Float32Array.prototype, 'set');

    expect(sharesFor(matrices, solid)).toEqual(before);
    expect(bounds).toHaveBeenCalledTimes(1);
    expect(components).toHaveBeenCalledTimes(20);
    expect(copies).not.toHaveBeenCalled();
    expect(samples).toEqual(saved);
  });
});
