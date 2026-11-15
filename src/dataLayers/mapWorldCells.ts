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
const outside = (value: number) => !Number.isFinite(value) || Math.abs(value) > 500;

function boundedAdd(cells: Set<string>, point: number[]) {
  cells.add(`${coordinate(point[0])},${coordinate(point[1])},${coordinate(point[2])}`);

  if (cells.size > MAX_SCAN_CELLS) refuse('Scan reconstruction', 'exceeds its observed cell budget');
}

class RayAxis {
  cell = 0;

  end = 0;

  step = 0;

  delta = Infinity;

  next = Infinity;

  private readonly start: number;

  private readonly origin: number;

  constructor(origin: number) {
    this.origin = origin;
    this.start = coordinate(origin);
  }

  reset(target: number) {
    const direction = target - this.origin;

    this.cell = this.start;
    this.end = coordinate(target);
    this.step = Math.sign(direction);
    this.delta = Math.abs(RECONSTRUCTION_M / direction);
    this.next =
      direction === 0 ? Infinity : ((this.cell + this.step * 0.5) * RECONSTRUCTION_M - this.origin) / direction;
  }

  advance(nearest: number) {
    if (this.next > nearest + 1e-12) return;

    this.cell += this.step;
    this.next += this.delta;
  }
}

function rayCells(origin: number[], free: Set<string>) {
  const x = new RayAxis(origin[0]);
  const y = new RayAxis(origin[1]);
  const z = new RayAxis(origin[2]);

  return (target: number[]) => {
    x.reset(target[0]);
    y.reset(target[1]);
    z.reset(target[2]);

    for (let i = 0; i < 30_000; i++) {
      if (x.cell === x.end && y.cell === y.end && z.cell === z.end) return;

      free.add(`${x.cell},${y.cell},${z.cell}`);

      if (free.size > MAX_SCAN_CELLS) refuse('Scan reconstruction', 'exceeds its observed cell budget');

      const nearest = Math.min(x.next, y.next, z.next);

      x.advance(nearest);
      y.advance(nearest);
      z.advance(nearest);
    }

    refuse('Scan reconstruction', 'exceeds its ray length budget');
  };
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

    if (origin.some(outside)) refuse('Scan reconstruction', 'extends beyond 500 m or contains non-finite samples');

    if (sweep.rays) this.origins.push(origin);

    const trace = sweep.rays ? rayCells(origin, this.free) : null;
    const point = [0, 0, 0];

    for (let i = 0; i < sweep.points.length; i += 3) {
      const x = sweep.points[i];
      const y = sweep.points[i + 1];
      const z = sweep.points[i + 2];

      point[0] = e[0] * x + e[4] * y + e[8] * z + e[12];
      point[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      point[2] = e[2] * x + e[6] * y + e[10] * z + e[14];

      if (point.some(outside)) refuse('Scan reconstruction', 'extends beyond 500 m or contains non-finite samples');

      boundedAdd(this.occupied, point);
      trace?.(point);
    }
  };

  evidence() {
    for (const cell of this.occupied) this.free.delete(cell);

    return { occupied: sortedCells(this.occupied), free: sortedCells(this.free), origins: this.origins };
  }
}
