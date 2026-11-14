import type { DriveCommand } from '../../sim/driveTypes';
import type { ConsoleSignal } from './format';
import { matches, type InputAxis, type JointField, type RobotField } from './signalNames';

export interface SignalSample {
  time: number;
  running: boolean;
  joints: Array<{ id: string } & Record<JointField, number>>;
  robot: Partial<Record<RobotField, number>>;
  probes: Record<string, number>;
  inputs: Record<string, DriveCommand | null>;
  goal: { passed: boolean; margin: number; failed: string[] } | null;
  cameras: string[];
  gestures?: Record<string, number>;
}

export type SignalValue = number | string[];

export interface Series {
  t: number[];
  v: number[];
}

export interface SignalTrack {
  frames: number;
  dt: number;
  time: (frame: number) => number;
  frameAt: (time: number) => number;
  values: (frame: number) => Map<string, SignalValue>;
  series: (id: string) => Series;
  column: (id: string) => Float64Array | null;
}

export interface Playhead {
  track: SignalTrack;
  frame: number;
}

export interface SignalBus {
  push: (sample: SignalSample) => void;
  read: (id: string) => SignalValue | undefined;
  series: (id: string) => Series;
  expand: (pattern: string) => string[];
  reset: () => void;
  play: (track: SignalTrack | null) => void;
  seek: (frame: number) => void;
  playhead: () => Playhead | null;
  subscribe: (listen: () => void) => () => void;
  version: () => number;
}

export const HISTORY_SECONDS = 120;

const AXES: Record<InputAxis, (c: DriveCommand) => number> = {
  forward: (c) => c.v[0],
  left: (c) => c.v[1],
  turn: (c) => c.v[2],
  lift: (c) => c.aux?.[0] ?? 0,
  grip: (c) => c.aux?.[1] ?? 0,
};

export function baseValues(s: SignalSample): Map<string, SignalValue> {
  const out = new Map<string, SignalValue>([['time', s.time]]);

  for (const j of s.joints) {
    out.set(`joint.${j.id}.target`, j.target);
    out.set(`joint.${j.id}.position`, j.position);
    out.set(`joint.${j.id}.effort`, j.effort);
  }

  for (const [field, value] of Object.entries(s.robot)) out.set(`robot.${field}`, value);

  for (const [name, value] of Object.entries(s.probes)) out.set(`probe.${name}`, value);

  for (const [source, command] of Object.entries(s.inputs))
    for (const [axis, read] of Object.entries(AXES)) out.set(`input.${source}.${axis}`, command ? read(command) : 0);

  if (s.goal) {
    out.set('goal.passed', Number(s.goal.passed));
    out.set('goal.margin', s.goal.margin);
    out.set('goal.failed', s.goal.failed);
  }

  for (const key of s.cameras) out.set(`camera.${key}`, [key]);

  for (const [name, value] of Object.entries(s.gestures ?? {})) out.set(`gesture.${name}`, value);

  return out;
}

interface Clock {
  elapsed: number;
  counts: Map<string, number>;
  was: Map<string, boolean>;
  last: number | null;
}

const fresh = (): Clock => ({ elapsed: 0, counts: new Map(), was: new Map(), last: null });

const numberOf = (values: Map<string, SignalValue>, id: string) => {
  const v = values.get(id);

  return typeof v === 'number' ? v : 0;
};

function caseValue(def: ConsoleSignal, values: Map<string, SignalValue>, clock: Clock, running: boolean): number {
  if (def.kind === 'timer') return def.seconds === undefined ? clock.elapsed : Math.max(0, def.seconds - clock.elapsed);

  if (def.kind === 'score')
    return def.sum.reduce((total, term) => total + term.times * numberOf(values, term.signal), 0);

  const read = values.get(def.when.signal);
  const v = typeof read === 'number' ? read : NaN;
  const now =
    !Number.isNaN(v) &&
    (def.when.above === undefined || v > def.when.above) &&
    (def.when.below === undefined || v < def.when.below);
  const rose = running && now && !clock.was.get(def.id);

  clock.was.set(def.id, now);

  if (rose) clock.counts.set(def.id, (clock.counts.get(def.id) ?? 0) + 1);

  return clock.counts.get(def.id) ?? 0;
}

function withCaseValues(
  defs: readonly ConsoleSignal[],
  base: Map<string, SignalValue>,
  clock: Clock,
  running: boolean,
) {
  defs.forEach((d) => base.set(d.id, caseValue(d, base, clock, running)));

  return base;
}

export interface CaseClock {
  next: (base: Map<string, SignalValue>, time: number, running: boolean) => Map<string, SignalValue>;
  idle: (base: Map<string, SignalValue>) => Map<string, SignalValue>;
  clear: () => void;
}

export function caseClock(defs: readonly ConsoleSignal[]): CaseClock {
  let clock = fresh();

  return {
    next(base, time, running) {
      const step = clock.last === null ? 0 : time - clock.last;

      if (running && step > 0 && step < 1) clock.elapsed += step;

      clock.last = time;

      return withCaseValues(defs, base, clock, running);
    },
    idle: (base) => withCaseValues(defs, base, clock, false),
    clear: () => {
      clock = fresh();
    },
  };
}

const HZ = 20;
const CAP = HISTORY_SECONDS * HZ;

export function createSignalBus(defs: readonly ConsoleSignal[] = []): SignalBus {
  const cases = caseClock(defs);
  let values = cases.idle(new Map());
  let history = new Map<string, Series>();
  let wasRunning = false;
  let version = 0;
  let playhead: Playhead | null = null;
  let shown: Map<string, SignalValue> | null = null;
  const listeners = new Set<() => void>();

  const record = (id: string, t: number, v: number) => {
    const s = history.get(id) ?? { t: [], v: [] };

    s.t.push(t);
    s.v.push(v);

    if (s.t.length > CAP) {
      s.t.splice(0, s.t.length - CAP);
      s.v.splice(0, s.v.length - CAP);
    }

    history.set(id, s);
  };

  const clear = () => {
    cases.clear();
    history = new Map();
    values = cases.idle(new Map([...values].filter(([id]) => !defs.some((d) => d.id === id))));
  };

  const changed = () => {
    version++;
    listeners.forEach((l) => l());
  };

  const current = () => shown ?? values;

  const show = (frame: number) => {
    if (!playhead) return;

    const at = Math.max(0, Math.min(playhead.track.frames - 1, Math.round(frame)));

    playhead = { track: playhead.track, frame: at };
    shown = playhead.track.values(at);
  };

  return {
    push(sample) {
      if (playhead) return;

      if (sample.running && !wasRunning) clear();

      wasRunning = sample.running;
      values = cases.next(baseValues(sample), sample.time, sample.running);
      values.forEach((v, id) => {
        if (typeof v === 'number') record(id, sample.time, v);
      });
      changed();
    },
    read: (id) => current().get(id),
    series: (id) => (playhead ? playhead.track.series(id) : (history.get(id) ?? { t: [], v: [] })),
    expand: (pattern) =>
      pattern.includes('*') ? [...current().keys()].filter((id) => matches(pattern, id)) : [pattern],
    reset: () => {
      clear();
      changed();
    },
    play(track) {
      if (track === playhead?.track) return;

      playhead = track && { track, frame: 0 };
      shown = null;
      show(0);
      changed();
    },
    seek(frame) {
      if (!playhead || Math.round(frame) === playhead.frame) return;

      show(frame);
      changed();
    },
    playhead: () => playhead,
    subscribe(listen) {
      listeners.add(listen);

      return () => {
        listeners.delete(listen);
      };
    },
    version: () => version,
  };
}
