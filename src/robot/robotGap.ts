import { radiansFromCounts, type RobotState } from './robotState';

export const GAP_LIMIT_RAD = (4 * Math.PI) / 180;
export const LAG_HOLD_MS = 2000;
export const MOVING_RAD = (0.1 * Math.PI) / 180;

const TRACE_MS = 5000;

export type Angles = Array<number | null>;

export class AngleTrace {
  private times: number[] = [];
  private angles: Angles[] = [];

  record(atMs: number, angles: Angles) {
    this.times.push(atMs);
    this.angles.push(angles);

    const stale = this.times.findIndex((t) => t >= atMs - TRACE_MS);

    if (stale <= 0) return;

    this.times = this.times.slice(stale);
    this.angles = this.angles.slice(stale);
  }

  at(ms: number): Angles | null {
    let lo = 0;
    let hi = this.times.length - 1;
    let found = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;

      if (this.times[mid] <= ms) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }

    return found >= 0 ? this.angles[found] : null;
  }

  clear() {
    this.times = [];
    this.angles = [];
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
  return (state.spec?.ids ?? []).map((id) => {
    const position = state.status?.joints.find((j) => j.id === id)?.position;

    return typeof position === 'number' ? radiansFromCounts(position) : null;
  });
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
