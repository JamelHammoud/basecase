import { Matrix4 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_CELLS, MAX_SCAN_ORIGINS } from '../cases/worldProvenance';
import type { SensorSweep } from './mapSession';
import { MapWorldCells, RECONSTRUCTION_M, sortedCells } from './mapWorldCells';

type Sweep = SensorSweep & { pose: Matrix4 };

const coordinate = (value: number) => Math.floor(value / RECONSTRUCTION_M + 0.5);
const sweepOf = (points: number[], pose = new Matrix4(), rays = true): Sweep => ({
  at: 0,
  frame: 'map',
  points: Float32Array.from(points),
  pose,
  rays,
});

function referenceRay(origin: number[], target: number[], free: Set<string>) {
  const axes = origin.map((value, i) => {
    const cell = coordinate(value);
    const direction = target[i] - value;
    const step = Math.sign(direction);

    return {
      cell,
      end: coordinate(target[i]),
      step,
      delta: Math.abs(RECONSTRUCTION_M / direction),
      next: direction === 0 ? Infinity : ((cell + step * 0.5) * RECONSTRUCTION_M - value) / direction,
    };
  });

  for (let i = 0; i < 30_000; i++) {
    if (axes.every((axis) => axis.cell === axis.end)) return;

    free.add(axes.map((axis) => axis.cell).join(','));

    const nearest = Math.min(...axes.map((axis) => axis.next));

    for (const axis of axes) {
      if (axis.next > nearest + 1e-12) continue;

      axis.cell += axis.step;
      axis.next += axis.delta;
    }
  }

  throw new Error('Reference ray exceeded its budget');
}

function referenceEvidence(sweeps: Sweep[]) {
  const occupied = new Set<string>();
  const free = new Set<string>();
  const origins: number[][] = [];

  for (const sweep of sweeps) {
    const e = sweep.pose.elements;
    const origin = [e[12], e[13], e[14]];

    if (sweep.rays) origins.push(origin);

    for (let i = 0; i < sweep.points.length; i += 3) {
      const [x, y, z] = sweep.points.subarray(i, i + 3);
      const point = [
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      ];

      occupied.add(point.map(coordinate).join(','));

      if (sweep.rays) referenceRay(origin, point, free);
    }
  }

  for (const key of occupied) free.delete(key);

  return { occupied: sortedCells(occupied), free: sortedCells(free), origins };
}

function variedPoints(count: number) {
  return Array.from({ length: count }, (_, i) => [
    Math.sin(i * 1.7) * 2,
    i % 3 ? Math.cos(i * 0.3) : 0,
    i % 5 ? Math.sin(i * 0.9) : 0,
  ]).flat();
}

function referenceOutcome(sweep: Sweep) {
  try {
    return referenceEvidence([sweep]);
  } catch (error) {
    expect(error).toEqual(new Error('Reference ray exceeded its budget'));

    return undefined;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('scan reconstruction sample workspaces', () => {
  it.each([
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
    [1, 1, 1],
    [-1, -1, -1],
  ])('keeps ten traversed cells and excludes the endpoint for (%i, %i, %i)', (x, y, z) => {
    const cells = new MapWorldCells();

    cells.add(sweepOf([x, y, z]));
    expect(cells.evidence()).toEqual({
      occupied: [[x * 10, y * 10, z * 10]],
      free: sortedCells(new Set(Array.from({ length: 10 }, (_, i) => [x * i, y * i, z * i].join(',')))),
      origins: [[0, 0, 0]],
    });
  });

  it('resets every axis across transformed sweeps, boundaries, zero rays and occupied-only clouds', () => {
    const points = [0, 0, 0, 0.05, -0.05, 0.15, 1, 1, 1, -1, -1, -1, ...variedPoints(60)];
    const sweeps = Array.from({ length: 40 }, (_, i) =>
      sweepOf(
        points,
        new Matrix4().makeRotationY((i * Math.PI) / 13).setPosition((i % 4) * 0.037, -(i % 3) * 0.023, i * 0.017),
        i % 4 !== 0,
      ),
    );
    const originals = sweeps.map((sweep) => ({ points: sweep.points.slice(), pose: sweep.pose.clone() }));
    const cells = new MapWorldCells();

    const expected = referenceEvidence(sweeps);

    sweeps.forEach(cells.add);
    expect(cells.evidence()).toEqual(expected);
    expect(cells.sweeps).toBe(sweeps.length);
    expect(cells.planar).toBe(false);
    sweeps.forEach((sweep, i) => {
      expect(sweep.points).toEqual(originals[i].points);
      expect(sweep.pose).toEqual(originals[i].pose);
    });
  });

  it.each([300, 600])('bounds preparation and removes per-return views across %i returns', (count) => {
    const sweep = sweepOf(variedPoints(count), new Matrix4().setPosition(0.05, -0.05, 0.25));
    const floor = vi.spyOn(Math, 'floor');
    const subarray = vi.spyOn(Float32Array.prototype, 'subarray');
    const expected = referenceEvidence([sweep]);

    expect(floor).toHaveBeenCalledTimes(count * 9);
    expect(subarray).toHaveBeenCalledTimes(count);
    floor.mockClear();
    subarray.mockClear();

    const cells = new MapWorldCells();

    cells.add(sweep);
    expect(floor).toHaveBeenCalledTimes(count * 6 + 3);
    expect(subarray).not.toHaveBeenCalled();
    expect(cells.evidence()).toEqual(expected);
  });

  it('preserves ray-length refusals at transformed half-cell boundaries', () => {
    const points = [0, 0, 0, 0.05, -0.05, 0.15, 1, 1, 1, -1, -1, -1, 1e-13, 0, 0, ...variedPoints(60)];
    let refusals = 0;

    for (let i = 0; i < 40; i++) {
      const pose = new Matrix4()
        .makeRotationY((i * Math.PI) / 13)
        .setPosition((i % 4) * 0.05, -(i % 3) * 0.05, i * 0.1);
      const sweep = sweepOf(points, pose);
      const expected = referenceOutcome(sweep);
      const cells = new MapWorldCells();

      if (!expected) {
        expect(() => cells.add(sweep)).toThrow(/ray length budget/);
        refusals++;

        continue;
      }

      cells.add(sweep);
      expect(cells.evidence()).toEqual(expected);
    }

    expect(refusals).toBeGreaterThan(0);
  });

  it('reads edits afresh and keeps previous evidence and other reconstructions independent', () => {
    const sweep = sweepOf([0, 0, 0, 1, 0, 0]);
    const cells = new MapWorldCells();
    const other = new MapWorldCells();

    cells.add(sweep);

    const first = structuredClone(cells.evidence());
    const retained = cells.evidence();

    sweep.points.set([0, 1, 0, 0, 0, 1]);
    sweep.pose.setPosition(0, 0, 1);
    cells.add(sweep);
    other.add(sweep);

    expect(retained.occupied).toEqual(first.occupied);
    expect(retained.free).toEqual(first.free);
    expect(retained.origins[0]).toEqual([0, 0, 0]);
    expect(other.evidence()).toEqual(referenceEvidence([sweep]));
    expect(cells.origins).toEqual([
      [0, 0, 0],
      [0, 0, 1],
    ]);
    expect(cells.occupied.has('10,0,0')).toBe(true);
  });
});

describe('scan reconstruction limits', () => {
  it('keeps empty and planar sweeps and refuses nonfinite and out-of-range samples', () => {
    const cells = new MapWorldCells();

    cells.add({ ...sweepOf([]), planar: true });
    expect(cells.evidence()).toEqual({ occupied: [], free: [], origins: [[0, 0, 0]] });
    expect(cells.planar).toBe(true);

    for (const value of [NaN, Infinity, -Infinity, 501, -501]) {
      expect(() => new MapWorldCells().add(sweepOf([value, 0, 0]))).toThrow(/500 m/);
      expect(() => new MapWorldCells().add(sweepOf([0, 0, 0], new Matrix4().setPosition(value, 0, 0)))).toThrow(
        /500 m/,
      );
    }

    const boundary = new MapWorldCells();

    boundary.add(sweepOf([500, -500, 0], new Matrix4(), false));
    expect(boundary.evidence().occupied).toEqual([[5000, -5000, 0]]);
  });

  it('keeps occupied, free, sweep and return budgets', () => {
    const occupied = new MapWorldCells();
    const free = new MapWorldCells();
    const sweeps = new MapWorldCells();
    const returns = new MapWorldCells();

    for (let i = 0; i < MAX_SCAN_CELLS; i++) {
      occupied.occupied.add(`reserved-${i}`);
      free.free.add(`reserved-${i}`);
    }

    expect(() => occupied.add(sweepOf([1, 0, 0]))).toThrow(/cell budget/);
    expect(() => free.add(sweepOf([1, 0, 0]))).toThrow(/cell budget/);
    sweeps.sweeps = MAX_SCAN_ORIGINS;
    expect(() => sweeps.add(sweepOf([]))).toThrow(/sample budget/);
    expect(() => returns.add({ ...sweepOf([]), points: new Float32Array(2_000_001 * 3) })).toThrow(/sample budget/);
  });
});
