import type { V3 } from './solidField';
import { cross, perpendicular, unit, type Bounds } from './vec';

export interface Motion {
  kind: 'revolute' | 'prismatic';
  origin: V3;
  axis: V3;
  range: [number, number];
}

const SAMPLE_SHARE = 0.75;
const OFFSET = 1 << 15;
const SPAN = 1 << 16;
const TWO_PI = Math.PI * 2;

const keyOf = (ip: number, iq: number) => (ip + OFFSET) * SPAN + iq + OFFSET;

function lowerBound(row: Float64Array, value: number): number {
  let lo = 0;
  let hi = row.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (row[mid] < value) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

const anyIn = (row: Float64Array, from: number, to: number) => {
  const at = lowerBound(row, from);

  return at < row.length && row[at] <= to;
};

const wrapAngle = (a: number) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);

export class SweepRaster {
  readonly motion: Motion;
  private readonly axis: V3;
  private readonly u: V3;
  private readonly w: V3;
  private readonly open = new Map<number, number[]>();
  private rows = new Map<number, Float64Array>();
  private extent = {
    pMin: Infinity,
    pMax: -Infinity,
    qMin: Infinity,
    qMax: -Infinity,
    sMin: Infinity,
    sMax: -Infinity,
  };
  private readonly coord: [number, number, number] = [0, 0, 0];

  private readonly cell: number;

  constructor(motion: Motion, cell: number) {
    this.motion = motion;
    this.cell = cell;
    this.axis = unit(motion.axis);
    this.u = perpendicular(this.axis);
    this.w = cross(this.axis, this.u);
  }

  get empty(): boolean {
    return this.extent.pMin > this.extent.pMax;
  }

  addSoup(soup: Float32Array): void {
    for (let t = 0; t + 8 < soup.length; t += 9) this.addTriangle(soup, t);
  }

  hits(x: number, y: number, z: number): boolean {
    const [p, q, s] = this.coords(x, y, z);
    const e = this.extent;

    if (
      p < e.pMin - 2 * this.cell ||
      p > e.pMax + 2 * this.cell ||
      q < e.qMin - 2 * this.cell ||
      q > e.qMax + 2 * this.cell
    )
      return false;

    const ip = Math.floor(p / this.cell);
    const iq = Math.floor(q / this.cell);
    const spans = this.spans(p, s);

    for (let dp = -1; dp <= 1; dp++) {
      for (let dq = -1; dq <= 1; dq++) {
        const row = this.rows.get(keyOf(ip + dp, iq + dq));

        if (row && spans.some(([from, to]) => anyIn(row, from, to))) return true;
      }
    }

    return false;
  }

  reach(): Bounds | null {
    if (this.empty) return null;

    const { origin } = this.motion;
    const e = this.extent;
    const pad = 2 * this.cell;

    if (this.motion.kind === 'prismatic') return this.prismaticReach(pad);

    const radius = Math.max(Math.abs(e.pMin), Math.abs(e.pMax)) + pad;
    const min = [0, 1, 2].map((k) => {
      const ends = [e.qMin - pad, e.qMax + pad].map((h) => origin[k] + h * this.axis[k]);

      return Math.min(...ends) - radius * Math.sqrt(Math.max(0, 1 - this.axis[k] ** 2));
    }) as V3;
    const max = [0, 1, 2].map((k) => {
      const ends = [e.qMin - pad, e.qMax + pad].map((h) => origin[k] + h * this.axis[k]);

      return Math.max(...ends) + radius * Math.sqrt(Math.max(0, 1 - this.axis[k] ** 2));
    }) as V3;

    return { min, max };
  }

  seal(): void {
    this.rows = new Map([...this.open].map(([key, values]) => [key, Float64Array.from(values).sort()]));
    this.open.clear();
  }

  private prismaticReach(pad: number): Bounds {
    const e = this.extent;
    const [lo, hi] = this.motion.range;
    const corners: V3[] = [];

    for (const p of [e.pMin - pad, e.pMax + pad])
      for (const q of [e.qMin - pad, e.qMax + pad])
        for (const s of [e.sMin + lo - pad, e.sMax + hi + pad]) corners.push(this.point(p, q, s));

    return {
      min: [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]))) as V3,
      max: [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]))) as V3,
    };
  }

  private point(p: number, q: number, s: number): V3 {
    const { origin } = this.motion;

    return [0, 1, 2].map((k) => origin[k] + p * this.u[k] + q * this.w[k] + s * this.axis[k]) as V3;
  }

  private spans(p: number, s: number): Array<[number, number]> {
    const [lo, hi] = this.motion.range;

    if (this.motion.kind === 'prismatic') return [[s - hi - this.cell, s - lo + this.cell]];

    const slack = this.cell / Math.max(p, this.cell);
    const width = hi - lo + 2 * slack;

    if (width >= TWO_PI) return [[-Infinity, Infinity]];

    const from = wrapAngle(s - hi - slack);
    const to = from + width;

    return to <= Math.PI
      ? [[from, to]]
      : [
          [from, Math.PI],
          [-Math.PI, to - TWO_PI],
        ];
  }

  private coords(x: number, y: number, z: number): [number, number, number] {
    const { origin } = this.motion;
    const [dx, dy, dz] = [x - origin[0], y - origin[1], z - origin[2]];
    const along = dx * this.axis[0] + dy * this.axis[1] + dz * this.axis[2];
    const a = dx * this.u[0] + dy * this.u[1] + dz * this.u[2];
    const b = dx * this.w[0] + dy * this.w[1] + dz * this.w[2];
    const c = this.coord;
    const prismatic = this.motion.kind === 'prismatic';

    c[0] = prismatic ? a : Math.hypot(a, b);
    c[1] = prismatic ? b : along;
    c[2] = prismatic ? along : Math.atan2(b, a);

    return c;
  }

  private addPoint(x: number, y: number, z: number): void {
    const [p, q, s] = this.coords(x, y, z);
    const key = keyOf(Math.floor(p / this.cell), Math.floor(q / this.cell));
    const row = this.open.get(key);
    const e = this.extent;

    if (row) row.push(s);
    else this.open.set(key, [s]);

    e.pMin = Math.min(e.pMin, p);
    e.pMax = Math.max(e.pMax, p);
    e.qMin = Math.min(e.qMin, q);
    e.qMax = Math.max(e.qMax, q);
    e.sMin = Math.min(e.sMin, s);
    e.sMax = Math.max(e.sMax, s);
  }

  private addTriangle(soup: Float32Array, t: number): void {
    const edge = Math.max(
      Math.hypot(soup[t + 3] - soup[t], soup[t + 4] - soup[t + 1], soup[t + 5] - soup[t + 2]),
      Math.hypot(soup[t + 6] - soup[t], soup[t + 7] - soup[t + 1], soup[t + 8] - soup[t + 2]),
      Math.hypot(soup[t + 6] - soup[t + 3], soup[t + 7] - soup[t + 4], soup[t + 8] - soup[t + 5]),
    );
    const n = Math.max(1, Math.ceil(edge / (this.cell * SAMPLE_SHARE)));

    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const [bu, bv] = [i / n, j / n];
        const at = (k: number) =>
          soup[t + k] + (soup[t + 3 + k] - soup[t + k]) * bu + (soup[t + 6 + k] - soup[t + k]) * bv;

        this.addPoint(at(0), at(1), at(2));
      }
    }
  }
}
