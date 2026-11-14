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

export interface SignalBus {
  push: (sample: SignalSample) => void;
  read: (id: string) => SignalValue | undefined;
  series: (id: string) => Series;
  expand: (pattern: string) => string[];
  reset: () => void;
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

function baseValues(s: SignalSample): Map<string, SignalValue> {
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

const HZ = 20;
const CAP = HISTORY_SECONDS * HZ;

export function createSignalBus(defs: readonly ConsoleSignal[] = []): SignalBus {
  let values = withCaseValues(defs, new Map(), fresh(), false);
  let history = new Map<string, Series>();
  let clock = fresh();
  let wasRunning = false;
  let version = 0;
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
    clock = fresh();
    history = new Map();
    values = withCaseValues(defs, new Map([...values].filter(([id]) => !defs.some((d) => d.id === id))), clock, false);
  };

  const changed = () => {
    version++;
    listeners.forEach((l) => l());
  };

  return {
    push(sample) {
      if (sample.running && !wasRunning) clear();

      wasRunning = sample.running;

      const step = clock.last === null ? 0 : sample.time - clock.last;

      if (sample.running && step > 0 && step < 1) clock.elapsed += step;

      clock.last = sample.time;
      values = withCaseValues(defs, baseValues(sample), clock, sample.running);
      values.forEach((v, id) => {
        if (typeof v === 'number') record(id, sample.time, v);
      });
      changed();
    },
    read: (id) => values.get(id),
    series: (id) => history.get(id) ?? { t: [], v: [] },
    expand: (pattern) => (pattern.includes('*') ? [...values.keys()].filter((id) => matches(pattern, id)) : [pattern]),
    reset: () => {
      clear();
      changed();
    },
    subscribe(listen) {
      listeners.add(listen);

      return () => {
        listeners.delete(listen);
      };
    },
    version: () => version,
  };
}
