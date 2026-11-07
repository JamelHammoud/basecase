import type { Plan, PlanOp } from './planTypes';
import type { Fault, MockValue } from './scenarioTypes';

export const CONTROL_PERIOD_MS = 20;
export const COORDINATOR_PERIOD_MS = 50;
export const INFER_MS = 200;
export const ASK_MS = 1500;
export const SKILL_MS = 1000;
export const PHASE_MS = 500;
export const SLOW_FACTOR = 10;
export const KNOWN = { name: 'Maya', score: 0.83 };
export const UNKNOWN = { name: null, score: 0.31 };
export const GALLERY_NAMES = ['Maya', 'Sam', 'Ana'];

export const sayMs = (text: string) => 300 + 40 * text.length;

export interface MockResult {
  num: number;
  name: string | null;
  ms?: number;
}

const record = (mock: MockValue | undefined) => (typeof mock === 'object' ? mock : undefined);

export function mockLatency(mock: MockValue | undefined, fallback: number): number {
  return record(mock)?.ms ?? fallback;
}

function identityOf(mock: MockValue | undefined): MockResult {
  const object = record(mock);

  if (object && ('name' in object || 'score' in object)) {
    return { num: object.score ?? KNOWN.score, name: object.name ?? null };
  }

  const value = object?.value ?? mock;

  if (value === 'unknown' || value === false) return { num: UNKNOWN.score, name: UNKNOWN.name };

  if (typeof value === 'string' && value !== 'known') return { num: KNOWN.score, name: value };

  return { num: KNOWN.score, name: KNOWN.name };
}

function plainOf(mock: MockValue | undefined, type: string): MockResult {
  const value = record(mock) ? record(mock)?.value : mock;

  if (type === 'boolean') return { num: value === false ? 0 : 1, name: null };

  if (type === 'number') return { num: typeof value === 'number' ? value : 1, name: null };

  return { num: 0, name: typeof value === 'string' ? value : '' };
}

export function inferResult(plan: Plan, op: PlanOp, mock: MockValue | undefined): MockResult {
  const type = plan.facts[op.fact ?? 0]?.type;

  return type === 'identity' ? identityOf(mock) : plainOf(mock, type);
}

export function askAnswer(plan: Plan, op: PlanOp, mock: MockValue | undefined): number {
  const answers = (op.answers ?? []).map((s) => plan.symbols[s]);
  const value = record(mock) ? record(mock)?.value : mock;
  const index = answers.indexOf(String(value));

  return index >= 0 ? index : 0;
}

export function worldNum(value: boolean | number | string): number {
  if (typeof value === 'boolean') return value ? 1 : 0;

  return typeof value === 'number' ? value : 0;
}

export function activeFault(faults: Fault[], names: string[], atMs: number): Fault | undefined {
  return faults.find((f) => names.includes(f.node) && f.at * 1000 <= atMs);
}
