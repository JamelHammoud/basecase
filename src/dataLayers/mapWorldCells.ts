import type { Matrix4 } from 'three';
import { refuse } from '../cases/validate';
import { MAX_SCAN_CELLS, MAX_SCAN_ORIGINS } from '../cases/worldProvenance';
import type { SensorSweep } from './mapSession';

export const RECONSTRUCTION_M = 0.1;
export const cellKey = (cell: number[]) => cell.join(',');
export const compareCells = (a: number[], b: number[]) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0];
export const sortedCells = (cells: Set<string>) =>
  [...cells].map((key) => key.split(',').map(Number)).sort(compareCells);

const coordinate = (value: number) => Math.floor(value / RECONSTRUCTION_M + 0.5);
const cellOf = (point: number[]) => point.map(coordinate);

function boundedAdd(cells: Set<string>, point: number[]) {
  cells.add(cellKey(point));

  if (cells.size > MAX_SCAN_CELLS) refuse('Scan reconstruction', 'exceeds its observed cell budget');
}

interface RayAxis {
  cell: number;
  end: number;
  step: number;
  delta: number;
  next: number;
}

function rayAxis(origin: number, target: number): RayAxis {
  const cell = coordinate(origin);
  const direction = target - origin;
  const step = Math.sign(direction);

  return {
    cell,
    end: coordinate(target),
    step,
    delta: Math.abs(RECONSTRUCTION_M / direction),
    next: direction === 0 ? Infinity : ((cell + step * 0.5) * RECONSTRUCTION_M - origin) / direction,
  };
}

function advance(axis: RayAxis, nearest: number) {
  if (axis.next > nearest + 1e-12) return;

  axis.cell += axis.step;
  axis.next += axis.delta;
}

function rayCells(origin: number[], target: number[], free: Set<string>) {
  const x = rayAxis(origin[0], target[0]);
  const y = rayAxis(origin[1], target[1]);
  const z = rayAxis(origin[2], target[2]);

  for (let i = 0; i < 30_000; i++) {
    if (x.cell === x.end && y.cell === y.end && z.cell === z.end) return;

    free.add(`${x.cell},${y.cell},${z.cell}`);

    if (free.size > MAX_SCAN_CELLS) refuse('Scan reconstruction', 'exceeds its observed cell budget');

    const nearest = Math.min(x.next, y.next, z.next);

    advance(x, nearest);
    advance(y, nearest);
    advance(z, nearest);
  }

  refuse('Scan reconstruction', 'exceeds its ray length budget');
}

export class MapWorldCells {
  readonly occupied = new Set<string>();

  readonly free = new Set<string>();

  readonly origins: number[][] = [];

  private returns = 0;

  planar = true;

  sweeps = 0;

  add = (sweep: SensorSweep & { pose: Matrix4 }): void => {
    this.sweeps++;
    this.returns += sweep.points.length / 3;

    if (this.sweeps > MAX_SCAN_ORIGINS || this.returns > 2_000_000)
      refuse('Scan reconstruction', 'exceeds its sensor sample budget');

    this.planar &&= !!sweep.planar;

    const e = sweep.pose.elements;
    const origin = [e[12], e[13], e[14]];

    if (origin.some((v) => !Number.isFinite(v) || Math.abs(v) > 500))
      refuse('Scan reconstruction', 'extends beyond 500 m or contains non-finite samples');

    if (sweep.rays) this.origins.push(origin);

    for (let i = 0; i < sweep.points.length; i += 3) {
      const [x, y, z] = sweep.points.subarray(i, i + 3);
      const point = [
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      ];

      if (point.some((v) => !Number.isFinite(v) || Math.abs(v) > 500))
        refuse('Scan reconstruction', 'extends beyond 500 m or contains non-finite samples');

      boundedAdd(this.occupied, cellOf(point));

      if (sweep.rays) rayCells(origin, point, this.free);
    }
  };

  evidence() {
    for (const cell of this.occupied) this.free.delete(cell);

    return { occupied: sortedCells(this.occupied), free: sortedCells(this.free), origins: this.origins };
  }
}
