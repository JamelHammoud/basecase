import type { TraceEvent } from '../../src/routines/scenarioTypes';
import type { PhysicsSample } from './interfaces';

export interface Span {
  skill: string | null;
  from: number;
  until: number;
}

export function controlSpans(trace: TraceEvent[], seconds: number): Span[] {
  const changes = trace.filter((e) => e.kind === 'control');

  return changes.map((e, i) => ({
    skill: e.skill ?? null,
    from: e.t / 1000,
    until: (changes[i + 1]?.t ?? seconds * 1000) / 1000,
  }));
}

function nearest(samples: PhysicsSample[], t: number): PhysicsSample {
  return samples.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best), samples[0]);
}

export function displacement(samples: PhysicsSample[], from: number, until: number): number {
  if (!samples.length) return 0;

  const a = nearest(samples, from).base;
  const b = nearest(samples, until).base;

  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function yawTurned(samples: PhysicsSample[], from: number, until: number): number {
  const inside = samples.filter((s) => s.t >= from && s.t <= until);

  if (inside.length < 2) return 0;

  let total = 0;
  let most = 0;

  for (let i = 1; i < inside.length; i++) {
    total += wrap(inside[i].yaw - inside[i - 1].yaw);
    most = Math.max(most, Math.abs(total));
  }

  return most;
}
