import { measuredRadians, type RobotState } from './robotState';

export const GAP_LIMIT_RAD = (4 * Math.PI) / 180;
export const LAG_HOLD_MS = 2000;
export const MOVING_RAD = (0.1 * Math.PI) / 180;

const TRACE_MS = 5000;

export type Angles = Array<number | null>;

export class AngleTrace {
  private times: number[] = [];
  private angles: Array<Angles | null> = [];
  private head = 0;
  private length = 0;

  record(atMs: number, angles: Angles) {
    const cutoff = atMs - TRACE_MS;

    while (this.length && this.times[this.head] < cutoff) {
      this.angles[this.head] = null;
      this.head = (this.head + 1) % this.times.length;
      this.length--;
    }

    if (this.length === this.times.length) this.grow();

    const tail = (this.head + this.length) % this.times.length;

    this.times[tail] = atMs;
    this.angles[tail] = angles;
    this.length++;
  }

  private grow() {
    const capacity = Math.max(32, this.length * 2);
    const times = new Array<number>(capacity);
    const angles = new Array<Angles | null>(capacity);

    for (let i = 0; i < this.length; i++) {
      const index = (this.head + i) % this.times.length;

      times[i] = this.times[index];
      angles[i] = this.angles[index];
    }

    this.times = times;
    this.angles = angles;
    this.head = 0;
  }

  at(ms: number): Angles | null {
    let lo = 0;
    let hi = this.length - 1;
    let found = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;

      if (this.times[(this.head + mid) % this.times.length] <= ms) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }

    return found >= 0 ? this.angles[(this.head + found) % this.times.length] : null;
  }

  clear() {
    this.times = [];
    this.angles = [];
    this.head = 0;
    this.length = 0;
  }
}

export class DaemonClock {
  private offset: number | null = null;

  pageMs(atUs: number | undefined, arrivalMs: number): number {
    if (typeof atUs !== 'number') return arrivalMs;

    const offset = arrivalMs - atUs / 1000;

    this.offset = this.offset === null ? offset : Math.min(this.offset, offset);

    return atUs / 1000 + this.offset;
  }

  reset() {
    this.offset = null;
  }
}

export function measuredAngles(state: RobotState): Angles {
  return (state.spec?.ids ?? []).map((id) => measuredRadians(state, id));
}

export function simAngles(
  joints: readonly string[],
  sim: { ids: readonly string[]; angles: ArrayLike<number> },
): Angles {
  return joints.map((id) => {
    const i = sim.ids.indexOf(id);
    const value = i >= 0 ? sim.angles[i] : undefined;

    return value !== undefined && Number.isFinite(value) ? value : null;
  });
}

export function jointGaps(measured: Angles, sim: Angles | null): Angles {
  return measured.map((m, k) => {
    const s = sim?.[k];

    return m === null || s === null || s === undefined ? null : Math.atan2(Math.sin(m - s), Math.cos(m - s));
  });
}

export function largestGap(joints: readonly string[], gaps: Angles): { joint: string; gap: number } | null {
  let largest: { joint: string; gap: number } | null = null;

  gaps.forEach((gap, k) => {
    const beaten = largest ? Math.abs(largest.gap) : -1;

    if (gap !== null && joints[k] && Math.abs(gap) > beaten) largest = { joint: joints[k], gap };
  });

  return largest;
}

interface LagReading {
  atMs: number;
  joints: readonly string[];
  measured: Angles;
  gaps: Angles;
}

export class LagWatch {
  readonly lagging = new Set<string>();
  private readonly since = new Map<string, number>();
  private previous: Angles = [];

  note({ atMs, joints, measured, gaps }: LagReading) {
    joints.forEach((joint, k) => {
      const gap = gaps[k];
      const moved = Math.abs((measured[k] ?? 0) - (this.previous[k] ?? measured[k] ?? 0)) > MOVING_RAD;

      if (gap === null || Math.abs(gap) <= GAP_LIMIT_RAD) {
        this.since.delete(joint);

        return;
      }

      if (moved && !this.since.has(joint)) this.since.set(joint, atMs);

      if (atMs - (this.since.get(joint) ?? atMs) >= LAG_HOLD_MS) this.lagging.add(joint);
    });
    this.previous = measured;
  }

  forget(joint: string) {
    this.lagging.delete(joint);
    this.since.delete(joint);
  }

  clear() {
    this.lagging.clear();
    this.since.clear();
    this.previous = [];
  }
}
