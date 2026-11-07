import type { Outcome } from './generateModel';
import type { Plan, PlanOp } from './planTypes';
import { KNOWN, UNKNOWN } from './scenarioMocks';
import type { Condition } from './schema';
import type { MockValue } from './scenarioTypes';
import type { FactValue } from './traceDecode';

export interface Route {
  decisions: Map<string, Outcome>;
  wants: Map<number, boolean>;
}

type Edge = { to: number; outcome?: Outcome; want?: boolean };

export function successors(op: PlanOp): Edge[] {
  if (op.kind === 'if')
    return [
      { to: op.then ?? -1, want: true },
      { to: op.else ?? -1, want: false },
    ];

  if (op.kind === 'together') return [...(op.branches ?? []).map((to) => ({ to })), { to: op.next }];

  return [
    { to: op.next, outcome: 'ok' },
    { to: op.onTimeout, outcome: 'timeout' },
    { to: op.onFail, outcome: 'fail' },
  ];
}

export function reachableFrom(plan: Plan, entry: number): number[] {
  const seen = new Set<number>();
  const stack = [entry];

  while (stack.length) {
    const pc = stack.pop() as number;

    if (pc < 0 || seen.has(pc)) continue;

    seen.add(pc);
    successors(plan.ops[pc]).forEach((e) => stack.push(e.to));
  }

  return [...seen].sort((a, b) => a - b);
}

function reachesTarget(plan: Plan, target: number): boolean[] {
  const reaches = plan.ops.map((_, pc) => pc === target);

  for (let pc = plan.ops.length - 1; pc >= 0; pc--) {
    reaches[pc] ||= successors(plan.ops[pc]).some((e) => e.to >= 0 && reaches[e.to]);
  }

  return reaches;
}

export function routeTo(plan: Plan, entry: number, target: number): Route | null {
  const reaches = reachesTarget(plan, target);
  const route: Route = { decisions: new Map(), wants: new Map() };
  let pc = entry;

  if (entry < 0 || !reaches[entry]) return null;

  while (pc !== target) {
    const op = plan.ops[pc];
    const edge = successors(op).find((e) => e.to >= 0 && reaches[e.to]) as Edge;

    if (edge.outcome && edge.outcome !== 'ok') route.decisions.set(op.node, edge.outcome);

    if (edge.want !== undefined) route.wants.set(pc, edge.want);

    pc = edge.to;
  }

  return route;
}

export type Assignment = Map<string, boolean | number | string | { name: string | null; score: number }>;

interface SolveContext {
  plan: Plan;
  near: boolean;
}

function otherAnswer(plan: Plan, fact: string, value: string): string {
  const ask = plan.ops.find((o) => o.kind === 'ask' && o.node === fact);
  const answers = (ask?.answers ?? []).map((s) => plan.symbols[s]);

  return answers.find((a) => a !== value) ?? `not ${value}`;
}

function factType(plan: Plan, fact: string): string {
  return plan.facts.find((f) => f.id === fact)?.type ?? 'boolean';
}

function scoreFor(c: SolveContext, threshold: number, above: boolean) {
  if (c.near) return above ? threshold : Math.round((threshold - 0.01) * 100) / 100;

  if (above) return Math.max(threshold, KNOWN.score);

  return Math.min(UNKNOWN.score, threshold - 0.05);
}

function solveLeaf(c: SolveContext, leaf: Extract<Condition, { fact: string }>, want: boolean): Assignment {
  const identity = factType(c.plan, leaf.fact) === 'identity';
  const asIdentity = (score: number) => (identity ? { name: KNOWN.name, score } : score);

  if ('atLeast' in leaf) return new Map([[leaf.fact, asIdentity(scoreFor(c, leaf.atLeast, want))]]);

  if ('atMost' in leaf) return new Map([[leaf.fact, asIdentity(scoreFor(c, leaf.atMost, !want))]]);

  if (want) return new Map([[leaf.fact, identity ? { name: String(leaf.is), score: KNOWN.score } : leaf.is]]);

  if (typeof leaf.is === 'boolean') return new Map([[leaf.fact, !leaf.is]]);

  if (typeof leaf.is === 'number') return new Map([[leaf.fact, leaf.is + 1]]);

  return new Map([[leaf.fact, identity ? { ...UNKNOWN } : otherAnswer(c.plan, leaf.fact, leaf.is)]]);
}

function merge(parts: (Assignment | null)[]): Assignment | null {
  const out: Assignment = new Map();

  for (const part of parts) {
    if (!part) return null;

    for (const [k, v] of part) {
      if (out.has(k) && JSON.stringify(out.get(k)) !== JSON.stringify(v)) return null;

      out.set(k, v);
    }
  }

  return out;
}

export function solve(c: SolveContext, cond: Condition, want: boolean): Assignment | null {
  if ('fact' in cond) return solveLeaf(c, cond, want);

  if ('not' in cond) return solve(c, cond.not, !want);

  const all = 'all' in cond;
  const items = all ? cond.all : cond.any;

  if (all === want) return merge(items.map((item) => solve(c, item, want)));

  return items.map((item) => solve(c, item, want)).find((a) => a !== null) ?? null;
}

export function toFactValue(value: boolean | number | string | { name: string | null; score: number }): FactValue {
  if (typeof value === 'object') return { num: value.score, name: value.name };

  if (typeof value === 'string') return { num: 0, name: value };

  return { num: typeof value === 'boolean' ? Number(value) : value, name: null };
}

export function toMock(value: boolean | number | string | { name: string | null; score: number }): MockValue {
  return typeof value === 'object' ? { name: value.name, score: value.score } : value;
}
