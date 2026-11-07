import type { RawEvent } from './coordinator';
import { NO_SKILL, type Plan, type PlanText } from './planTypes';
import type { TraceEvent } from './scenarioTypes';

const DROPPED = ['cooldown', 'retrigger', 'busy'];
const FAILED = ['reported', 'busy', 'stale', 'bad-answer'];
const STOPPED = ['base timed out', 'base failed', 'stop timed out', 'stop failed', 'requested'];
const OUTCOME = ['false', 'true', 'unknown'];

export interface FactValue {
  num: number;
  name: string | null;
}

export function renderText(text: PlanText, valueOf: (fact: number) => FactValue | undefined): string {
  return text.slots.reduce((out, slot) => {
    const value = valueOf(slot.fact);
    const filled = {
      name: value?.name ?? '',
      score: (value?.num ?? 0).toFixed(2),
      value: value?.name ?? String(value?.num ?? ''),
    }[slot.field];

    return out.replace(`{${slot.slot}}`, filled);
  }, text.template);
}

export class TraceDecoder {
  private readonly plan: Plan;
  private readonly symbols: string[];

  constructor(plan: Plan, symbols: string[]) {
    this.plan = plan;
    this.symbols = symbols;
  }

  skill(index: number): string | null {
    return index === NO_SKILL ? null : (this.plan.skills[index]?.id ?? `skill ${index}`);
  }

  node(pc: number): string {
    return this.plan.ops[pc]?.node ?? `op ${pc}`;
  }

  reaction(index: number): string {
    return this.plan.reactions[index]?.id ?? `reaction ${index}`;
  }

  private symbol(index: number): string | null {
    return index >= 0 ? (this.symbols[index] ?? null) : null;
  }

  decode(e: RawEvent): TraceEvent {
    const t = e.t;
    const byKind: Record<string, () => TraceEvent> = {
      run: () => ({ t, kind: 'run', skill: this.skill(e.a), token: e.b }),
      release: () => ({ t, kind: 'release', skill: this.skill(e.a), token: e.b }),
      fired: () => ({ t, kind: 'fired', reaction: this.reaction(e.a) }),
      dropped: () => ({ t, kind: 'dropped', reaction: this.reaction(e.a), why: DROPPED[e.b] }),
      queued: () => ({ t, kind: 'queued', reaction: this.reaction(e.a) }),
      restarted: () => ({ t, kind: 'restarted', reaction: this.reaction(e.a) }),
      preempted: () => ({ t, kind: 'preempted', reaction: this.reaction(e.a), by: this.reaction(e.b) }),
      ended: () => ({ t, kind: 'ended', reaction: this.reaction(e.a), why: e.b === 0 ? 'done' : 'abandoned' }),
      opStart: () => ({ t, kind: 'opStart', node: this.node(e.a), token: e.b }),
      opDone: () => ({ t, kind: 'opDone', node: this.node(e.a), token: e.b }),
      opTimeout: () => ({ t, kind: 'opTimeout', node: this.node(e.a), token: e.b }),
      opFail: () => ({ t, kind: 'opFail', node: this.node(e.a), why: FAILED[e.b] ?? 'reported', token: e.c }),
      opCancel: () => ({ t, kind: 'opCancel', node: this.node(e.a), token: e.b }),
      branch: () => ({ t, kind: 'branch', node: this.node(e.a), taken: e.b === 1 }),
      leaf: () => ({
        t,
        kind: 'leaf',
        fact: this.plan.facts[e.a]?.id,
        outcome: OUTCOME[e.b],
        value: e.v,
        name: this.symbol(e.c),
      }),
      stale: () => ({ t, kind: 'stale', fact: this.plan.facts[e.a]?.id }),
      fresh: () => ({ t, kind: 'fresh', fact: this.plan.facts[e.a]?.id }),
      watcher: () => ({ t, kind: 'watcher', node: this.plan.watchers[e.a]?.id, enabled: e.b === 1 }),
      baseEnd: () => ({ t, kind: 'baseEnd', why: e.a === 0 ? 'timeout' : 'failed' }),
      safeStop: () => ({ t, kind: 'safeStop', why: STOPPED[e.a] ?? 'requested' }),
      lost: () => ({ t, kind: 'lost', count: e.a }),
    };

    return (byKind[e.k] ?? (() => ({ t, kind: e.k })))();
  }
}
