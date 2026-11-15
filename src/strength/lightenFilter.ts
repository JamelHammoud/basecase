import { cellCenter, type HexMesh } from './mesh';
import { cellIndex } from './voxels';
import type { V3 } from './types';

export interface DensityFilter {
  start: Int32Array;
  near: Int32Array;
  weight: Float64Array;
}

function offsetsFor(h: V3, radius: number): Array<[number, number, number, number]> {
  const steps = h.map((value) => Math.ceil(radius / value));
  const out: Array<[number, number, number, number]> = [];

  for (let dz = -steps[2]; dz <= steps[2]; dz++)
    for (let dy = -steps[1]; dy <= steps[1]; dy++)
      for (let dx = -steps[0]; dx <= steps[0]; dx++)
        out.push([dx, dy, dz, radius - Math.hypot(dx * h[0], dy * h[1], dz * h[2])]);

  return out.filter(([, , , weight]) => weight > 0);
}

export function densityFilter(mesh: HexMesh, radius: number): DensityFilter {
  const { grid } = mesh;
  const elementOf = new Int32Array(grid.solid.length).fill(-1);
  const offsets = offsetsFor(grid.h, radius);
  const start = new Int32Array(mesh.cells.length + 1);
  const near: number[] = [];
  const weight: number[] = [];

  mesh.cells.forEach((cell, e) => (elementOf[cell] = e));
  mesh.cells.forEach((cell, e) => {
    const p = cellCenter(grid, cell);
    const own = p.map((v, axis) => Math.round((v - grid.origin[axis]) / grid.h[axis] - 0.5));

    for (const [dx, dy, dz, w] of offsets) {
      const ijk = [own[0] + dx, own[1] + dy, own[2] + dz];

      if (ijk.some((v, axis) => v < 0 || v >= grid.n[axis])) continue;

      const other = elementOf[cellIndex(grid, ijk[0], ijk[1], ijk[2])];

      if (other < 0) continue;

      near.push(other);
      weight.push(w);
    }

    start[e + 1] = near.length;
  });

  return { start, near: Int32Array.from(near), weight: Float64Array.from(weight) };
}

export function filteredSensitivity(filter: DensityFilter, density: Float64Array, raw: Float64Array): Float64Array {
  return density.map((value, e) => {
    let sum = 0;
    let weights = 0;

    for (let i = filter.start[e]; i < filter.start[e + 1]; i++) {
      const other = filter.near[i];
      const w = filter.weight[i];

      sum += w * density[other] * raw[other];
      weights += w;
    }

    return sum / (Math.max(0.001, value) * weights);
  });
}

interface DensityUpdate {
  density: Float64Array;
  gradient: Float64Array;
  frozen: Uint8Array;
  budget: number;
}

function trialDensity(result: Float64Array, { density, gradient, frozen }: DensityUpdate, lambda: number): number {
  let volume = 0;

  for (let e = 0; e < density.length; e++) {
    const value = density[e];
    const next = frozen[e]
      ? 1
      : Math.max(0.001, value - 0.15, Math.min(1, value + 0.15, value * Math.sqrt(Math.max(0, -gradient[e]) / lambda)));

    result[e] = next;
    volume += next;
  }

  return volume;
}

export function optimalityUpdate(options: DensityUpdate): Float64Array {
  let low = 0;
  let high = -Infinity;
  const result = new Float64Array(options.density.length);

  for (const value of options.gradient) high = Math.max(high, -value);

  high *= 1e6;

  for (let step = 0; step < 55; step++) {
    const lambda = (low + high) / 2;
    const volume = trialDensity(result, options, lambda);

    if (volume > options.budget) low = lambda;
    else high = lambda;
  }

  return result;
}
