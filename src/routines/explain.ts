import { runClock } from '../utils/duration';
import { negative } from '../../electron/minus.mjs';
import { reachableFrom } from './generatePaths';
import { findNode } from './nodes';
import type { Plan, PlanOp } from './planTypes';
import type { TraceEvent } from './scenarioTypes';
import type { Condition } from './schema';

import { span } from './explainGraph';

export { describeRoutine } from './explainGraph';

const at = (ms: number) => runClock(ms / 1000);
const hundredths = (n: number) => n.toFixed(2);
const two = (n: number) => negative(n, hundredths);

function factLabel(plan: Plan, fact: string): string {
  const op = plan.ops.find((o) => o.node === fact && (o.kind === 'infer' || o.kind === 'ask'));
  const watcher = plan.watchers.find((w) => w.id === fact);
  const model = op?.model ?? watcher?.model ?? '';

  return findNode(model)?.label ?? fact;
}

function leafFor(cond: Condition, fact: string): Extract<Condition, { fact: string }> | undefined {
  if ('fact' in cond) return cond.fact === fact ? cond : undefined;

  if ('not' in cond) return leafFor(cond.not, fact);

  const items = 'all' in cond ? cond.all : cond.any;

  return items.map((c) => leafFor(c, fact)).find(Boolean);
}

function describeLeaf(plan: Plan, leaf: TraceEvent, cond: Condition | undefined): string {
  const label = factLabel(plan, leaf.fact ?? '');
  const test = cond && leafFor(cond, leaf.fact ?? '');
  const value = leaf.value ?? 0;

  if (leaf.outcome === 'unknown') return `${label} had no fresh answer`;

  if (test && 'atLeast' in test) {
    return `${label} ${leaf.outcome === 'true' ? 'matched' : 'scored'} ${two(value)} (needs ${two(test.atLeast)})`;
  }

  if (test && 'atMost' in test) return `${label} read ${two(value)} (limit ${two(test.atMost)})`;

  if (leaf.name) return `${label} answered ${leaf.name}`;

  return `${label} said ${value === 1 ? 'yes' : 'no'}`;
}

function leavesBefore(trace: TraceEvent[], index: number): TraceEvent[] {
  const out: TraceEvent[] = [];

  for (let i = index - 1; i >= 0 && trace[i].kind === 'leaf'; i--) out.unshift(trace[i]);

  return out;
}

const pcOf = (plan: Plan, node: string | undefined) => plan.ops.findIndex((o) => o.node === node);

function leads(plan: Plan, from: number | undefined, to: number): boolean {
  return from !== undefined && from >= 0 && reachableFrom(plan, from).includes(to);
}

function failureCause(plan: Plan, e: TraceEvent, target: number): string | null {
  const op = plan.ops[pcOf(plan, e.node)];
  const label = op ? nodeLabel(op) : (e.node ?? '');

  if (e.kind === 'opTimeout' && op && leads(plan, op.onTimeout, target)) {
    return `${label} ran out of time after ${span(op.timeoutMs)}`;
  }

  if (e.kind === 'opFail' && op && leads(plan, op.onFail, target)) return `${label} failed`;

  return null;
}

function branchCause(plan: Plan, trace: TraceEvent[], index: number, target: number): string | null {
  const e = trace[index];
  const op = plan.ops[pcOf(plan, e.node)];

  if (!op || !leads(plan, e.taken ? op.then : op.else, target)) return null;

  const cond = plan.condSources[op.test ?? 0];

  return leavesBefore(trace, index)
    .map((leaf) => describeLeaf(plan, leaf, cond))
    .join(' and ');
}

function firedCause(plan: Plan, trace: TraceEvent[], index: number): string {
  const reaction = plan.reactions.find((r) => r.id === trace[index].reaction);
  const cond = reaction ? plan.condSources[reaction.when] : undefined;

  return leavesBefore(trace, index)
    .map((leaf) => describeLeaf(plan, leaf, cond))
    .join(' and ');
}

export function nodeLabel(op: PlanOp): string {
  return (op.model && findNode(op.model)?.label) || op.node;
}

export function causeOf(plan: Plan, trace: TraceEvent[], index: number): string {
  const target = pcOf(plan, trace[index].node);

  for (let i = index - 1; i >= 0; i--) {
    const e = trace[i];
    const found =
      e.kind === 'branch'
        ? branchCause(plan, trace, i, target)
        : (e.kind.startsWith('op') && failureCause(plan, e, target)) || null;

    if (found) return found;

    if (e.kind === 'fired') return firedCause(plan, trace, i);
  }

  return 'the Routine started';
}

export function explainEvent(plan: Plan, trace: TraceEvent[], index: number): string | null {
  const e = trace[index];

  if (e.kind === 'said') return `Said ${e.text} at ${at(e.t)} because ${causeOf(plan, trace, index)}`;

  if (e.kind === 'fired') return `Started ${e.reaction} at ${at(e.t)} because ${firedCause(plan, trace, index)}`;

  if (e.kind === 'preempted') return `Stopped ${e.reaction} at ${at(e.t)} for ${e.by}, which comes first`;

  if (e.kind === 'safeStop') return `Stopped safely at ${at(e.t)} because the ${e.why}`;

  if (e.kind === 'tripped') return `Control stopped the robot at ${at(e.t)} because the coordinator went quiet`;

  return null;
}

export function explainTrace(plan: Plan, trace: TraceEvent[]): string[] {
  return trace.flatMap((_, i) => explainEvent(plan, trace, i) ?? []);
}
