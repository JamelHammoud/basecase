import { describe, expect, it } from 'vitest';
import { conjugateGradient, multiplyBlocks } from './cg';
import { assembleElastic, elasticPattern, type BlockMatrix } from './elasticPattern';
import { hexElement } from './hexElement';
import { LAYERED, stiffnessFor } from './material';
import { hexMesh, type HexMesh } from './mesh';

function fixture(sparse = false): HexMesh {
  const solid = Uint8Array.from({ length: 24 }, (_, i) => (sparse && (i === 5 || i === 7 || i === 11) ? 0 : 1));

  return hexMesh({ n: [4, 3, 2], h: [1, 1.5, 2], origin: [-2, 3, 1], solid });
}

function denseAssembly(mesh: HexMesh, scale: Float64Array, stiffness: Float64Array): Float64Array[] {
  const dense = Array.from({ length: mesh.positions.length }, () => new Float64Array(mesh.positions.length));

  for (let e = 0; e < mesh.cells.length; e++)
    for (let a = 0; a < 24; a++)
      for (let b = 0; b < 24; b++) {
        const row = mesh.nodes[e * 8 + Math.floor(a / 3)] * 3 + (a % 3);
        const col = mesh.nodes[e * 8 + Math.floor(b / 3)] * 3 + (b % 3);

        dense[row][col] += scale[e] * stiffness[a * 24 + b];
      }

  return dense;
}

function denseOf(matrix: BlockMatrix): Float64Array[] {
  const size = (matrix.rowStart.length - 1) * 3;
  const dense = Array.from({ length: size }, () => new Float64Array(size));

  for (let i = 0; i < size / 3; i++)
    for (let k = matrix.rowStart[i]; k < matrix.rowStart[i + 1]; k++)
      for (let local = 0; local < 9; local++)
        dense[i * 3 + Math.floor(local / 3)][matrix.cols[k] * 3 + (local % 3)] = matrix.values[k * 9 + local];

  return dense;
}

const stiffnessForMesh = (mesh: HexMesh) => hexElement(mesh.grid.h, stiffnessFor(LAYERED.PLA!, [0, 0, 1])).stiffness;

describe('prepared elastic connectivity', () => {
  it.each([false, true])('matches independent dense assembly with sparse cells %s and changed inputs', (sparse) => {
    const mesh = fixture(sparse);
    const before = structuredClone(mesh);
    const pattern = elasticPattern(mesh.nodes, mesh.positions.length / 3);
    const saved = structuredClone(pattern);

    for (const factor of [0, 0.01, 1, 2]) {
      const scale = Float64Array.from(mesh.cells, (_, e) => factor * (0.1 + (e % 5) / 5));
      const stiffness = stiffnessForMesh(mesh).map((v) => v * (factor + 1));
      const matrix = assembleElastic(pattern, scale, stiffness);
      const expected = denseAssembly(mesh, scale, stiffness);
      const x = Float64Array.from({ length: mesh.positions.length }, (_, i) => Math.sin(i));
      const y = new Float64Array(x.length);
      const denseProduct = Float64Array.from(expected, (row) => row.reduce((sum, value, i) => sum + value * x[i], 0));

      multiplyBlocks(matrix, x, y);
      expect(denseOf(matrix)).toEqual(expected);
      y.forEach((value, i) => expect(value).toBeCloseTo(denseProduct[i], 8));
    }

    expect(pattern).toEqual(saved);
    expect(mesh).toEqual(before);
  });

  it('keeps earlier matrices and connectivity unchanged through different loads, supports and densities', () => {
    const mesh = fixture(true);
    const pattern = elasticPattern(mesh.nodes, mesh.positions.length / 3);
    const before = structuredClone(pattern);
    const stiffness = stiffnessForMesh(mesh);
    const scale = new Float64Array(mesh.cells.length).fill(1);
    const first = assembleElastic(pattern, scale, stiffness);
    const values = first.values.slice();

    for (const side of [-2, 2]) {
      const fixed = Uint8Array.from(mesh.positions, (_, i) => Number(mesh.positions[Math.floor(i / 3) * 3] === side));
      const desired = Float64Array.from(fixed, (pin, i) => (pin ? 0 : Math.sin(i * 1.3) * 0.01));
      const density = scale.map((_, e) => 0.2 + (e % 4) / 4);
      const matrix = assembleElastic(pattern, density, stiffness);
      const force = new Float64Array(desired.length);

      multiplyBlocks(matrix, desired, force);

      const result = conjugateGradient({ pattern, scale: density, stiffness, fixed }, force, {
        tolerance: 1e-10,
        maxIterations: 1000,
      });

      expect(result.residual).toBeLessThan(1e-10);
      result.u.forEach((value, i) => expect(value).toBeCloseTo(desired[i], 8));
      expect(pattern).toEqual(before);
      expect(first.values).toEqual(values);
    }
  });

  it('prepares empty meshes and retains independent disconnected blocks', () => {
    const empty = elasticPattern(new Int32Array(), 0);

    expect(assembleElastic(empty, new Float64Array(), new Float64Array())).toEqual({
      rowStart: Int32Array.of(0),
      cols: new Int32Array(),
      values: new Float64Array(),
    });

    const mesh = fixture();

    mesh.nodes = Int32Array.from({ length: 16 }, (_, i) => 15 - i);
    mesh.cells = Int32Array.of(0, 1);
    mesh.positions = mesh.positions.slice(0, 48);

    const pattern = elasticPattern(mesh.nodes, 16);
    const scale = Float64Array.of(0.5, 0.9);
    const stiffness = stiffnessForMesh(mesh);

    expect(denseOf(assembleElastic(pattern, scale, stiffness))).toEqual(denseAssembly(mesh, scale, stiffness));
    expect(pattern.slots).toHaveLength(128);
  });
});
