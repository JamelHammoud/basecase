import { CONTROL_PERIOD_MS, GALLERY_NAMES } from './scenarioMocks';
import type { EventMatch, Expectation, Scenario, TraceEvent, Window } from './scenarioTypes';

const END_KINDS = new Set(['opDone', 'opTimeout', 'opFail', 'opCancel']);
const MATCH_KEYS = ['node', 'reaction', 'fact', 'why'] as const;
const DEFAULT_TOLERANCE_MS = 60;

export interface RunRecord {
  scenario: Scenario;
  trace: TraceEvent[];
  said: string[];
  maxControlGapMs: number;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const inWindow = (t: number, w: Window, endMs: number) =>
  t >= (w.from ?? 0) * 1000 && t <= (w.until === undefined ? endMs : w.until * 1000);

function controlChanges(trace: TraceEvent[]) {
  return trace.filter((e) => e.kind === 'control');
}

function skillAt(changes: TraceEvent[], t: number): string | null {
  let skill: string | null = null;

  for (const c of changes) {
    if (c.t > t) break;

    skill = c.skill ?? null;
  }

  return skill;
}

export function bodySequence(trace: TraceEvent[]): string[] {
  const out: string[] = [];

  for (const c of controlChanges(trace)) {
    if (c.skill && out[out.length - 1] !== c.skill) out.push(c.skill);
  }

  return out;
}

export function visitsOf(trace: TraceEvent[]): string[] {
  return trace
    .filter((e) => e.kind === 'opStart' || e.kind === 'branch')
    .map((e) => (e.kind === 'branch' ? `${e.node}:${e.taken ? 'then' : 'else'}` : (e.node as string)))
    .sort();
}

function checkAlways(r: RunRecord, skill: string, w: Window, endMs: number): string | null {
  const changes = controlChanges(r.trace);
  const from = (w.from ?? 0) * 1000;
  const until = w.until === undefined ? endMs : w.until * 1000;
  const wrong = [from, ...changes.filter((c) => c.t > from && c.t <= until).map((c) => c.t)].find(
    (t) => skillAt(changes, t) !== skill,
  );

  return wrong === undefined
    ? null
    : `Expected ${skill} the whole time, but control ran ${skillAt(changes, wrong)} at ${seconds(wrong)}`;
}

function checkNever(r: RunRecord, never: { said?: string; skill?: string }, w: Window, endMs: number) {
  const said = never.said?.toLowerCase();
  const hit = r.trace.find(
    (e) =>
      inWindow(e.t, w, endMs) &&
      ((said !== undefined && e.kind === 'said' && e.text?.toLowerCase().includes(said)) ||
        (never.skill !== undefined && e.kind === 'control' && e.skill === never.skill)),
  );

  return hit ? `Expected never ${never.said ?? never.skill}, but got it at ${seconds(hit.t)}` : null;
}

function matches(e: TraceEvent, m: EventMatch, endMs: number): boolean {
  return e.kind === m.event && MATCH_KEYS.every((k) => m[k] === undefined || e[k] === m[k]) && inWindow(e.t, m, endMs);
}

function checkEvent(r: RunRecord, m: EventMatch, endMs: number): string | null {
  const count = r.trace.filter((e) => matches(e, m, endMs)).length;
  const ok = m.count === undefined ? count > 0 : count === m.count;
  const what = [m.event, m.reaction, m.node, m.fact, m.why].filter(Boolean).join(' ');

  return ok ? null : `Expected ${m.count ?? 'at least 1'} × ${what}, got ${count}`;
}

function checkElapsed(r: RunRecord, spec: { node: string; ms: number; tolerance?: number }): string | null {
  const start = r.trace.find((e) => e.kind === 'opStart' && e.node === spec.node);
  const end = start && r.trace.find((e) => END_KINDS.has(e.kind) && e.node === spec.node && e.t >= start.t);

  if (!start || !end) return `Expected ${spec.node} to start and end`;

  const took = end.t - start.t;
  const ok = took >= spec.ms && took <= spec.ms + (spec.tolerance ?? DEFAULT_TOLERANCE_MS);

  return ok ? null : `Expected ${spec.node} to take ${spec.ms} ms, took ${took} ms`;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function checkOne(r: RunRecord, e: Expectation, endMs: number): string | null {
  if ('always' in e) return checkAlways(r, e.always.skill, e, endMs);

  if ('never' in e) return checkNever(r, e.never, e, endMs);

  if ('said' in e) {
    const hit = r.trace.some((x) => x.kind === 'said' && x.text === e.said && inWindow(x.t, e, endMs));

    return hit ? null : `Expected to say "${e.said}"`;
  }

  if ('saidExactly' in e) {
    return same(r.said, e.saidExactly)
      ? null
      : `Expected to say ${JSON.stringify(e.saidExactly)}, said ${JSON.stringify(r.said)}`;
  }

  if ('skills' in e) {
    const got = bodySequence(r.trace);

    return same(got, e.skills) ? null : `Expected skills ${e.skills.join(' → ')}, ran ${got.join(' → ')}`;
  }

  if ('visits' in e) {
    const got = visitsOf(r.trace);

    return same(got, [...e.visits].sort()) ? null : `Expected visits ${e.visits.join(', ')}, got ${got.join(', ')}`;
  }

  if ('elapsed' in e) return checkElapsed(r, e.elapsed);

  return checkEvent(r, e, endMs);
}

function nameSafety(r: RunRecord): string[] {
  const failures: string[] = [];
  const recognised = new Set<string>();

  for (const e of r.trace) {
    if (e.kind === 'result' && e.name) recognised.add(e.name.toLowerCase());

    if (e.kind !== 'said') continue;

    for (const name of GALLERY_NAMES) {
      const spoken = new RegExp(`\\b${name}\\b`, 'i').test(e.text ?? '');

      if (spoken && !recognised.has(name.toLowerCase())) {
        failures.push(`Said "${e.text}" at ${seconds(e.t)} without recognising ${name}`);
      }
    }
  }

  return failures;
}

function afterSafeStop(r: RunRecord): string[] {
  const stop = r.trace.find((e) => e.kind === 'safeStop');

  if (!stop) return [];

  const late = r.trace.filter((e) => e.t > stop.t && (e.kind === 'said' || e.kind === 'fired'));

  return late.map((e) => `${e.kind} at ${seconds(e.t)} after the safe stop`);
}

function voiceOverlap(r: RunRecord): string[] {
  const speaking = new Set<number>();
  const failures: string[] = [];

  for (const e of r.trace) {
    if (e.kind === 'said' && speaking.size > 0) failures.push(`Two things spoke at once at ${seconds(e.t)}`);

    if (e.kind === 'said') speaking.add(e.token ?? 0);
    else if (END_KINDS.has(e.kind)) speaking.delete(e.token ?? -1);
  }

  return failures;
}

export function invariants(r: RunRecord): string[] {
  const gap = r.maxControlGapMs > CONTROL_PERIOD_MS ? [`Control waited ${r.maxControlGapMs} ms between reads`] : [];

  return [...gap, ...nameSafety(r), ...afterSafeStop(r), ...voiceOverlap(r)];
}

export function checkExpectations(r: RunRecord): string[] {
  const endMs = r.scenario.seconds * 1000;

  return r.scenario.expect.flatMap((e) => checkOne(r, e, endMs) ?? []);
}
