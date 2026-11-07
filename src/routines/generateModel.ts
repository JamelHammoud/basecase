import { ABANDON, END, OP_CODES, type Instr, type Plan, type PlanOp } from './planTypes';
import { ASK_MS, INFER_MS, inferResult, SKILL_MS, sayMs } from './scenarioMocks';
import type { MockValue } from './scenarioTypes';
import { type FactValue, renderText } from './traceDecode';

export type Outcome = 'ok' | 'timeout' | 'fail' | 'garbage';

export interface Assumed {
  decisions: Map<string, Outcome>;
  mocks: Record<string, MockValue>;
  world: Map<number, FactValue>;
}

export interface Expected {
  says: string[];
  body: string[];
  visits: string[];
  timeouts: { node: string; ms: number }[];
  ended: 'done' | 'abandoned';
  durationMs: number;
  joinAny: boolean;
  reached: Set<string>;
  startMs: Map<string, number>;
  fails: number;
}

type Tri = 0 | 1 | 2;

const TRUE: Tri = 1;
const FALSE: Tri = 0;
const UNKNOWN: Tri = 2;

export function skillName(plan: Plan, index: number | undefined): string {
  return plan.skills[index ?? -1]?.id ?? '';
}

export function stopViaOf(plan: Plan, skill: string): string {
  const s = plan.skills.find((x) => x.id === skill);

  return s ? skillName(plan, s.stopVia) : skill;
}

function combine(items: Tri[], dominant: Tri): Tri {
  if (items.includes(dominant)) return dominant;

  return items.includes(UNKNOWN) ? UNKNOWN : ((1 - dominant) as Tri);
}

export function evalCond(plan: Plan, code: Instr[], facts: Map<number, FactValue>): Tri {
  const stack: Tri[] = [];
  const leaf = (fact: number, test: (v: FactValue) => boolean): Tri => {
    const v = facts.get(fact);

    if (!v) return UNKNOWN;

    return test(v) ? TRUE : FALSE;
  };

  for (const [code_, a, b] of code) {
    if (code_ === OP_CODES.all || code_ === OP_CODES.any) {
      const items = stack.splice(stack.length - a, a);

      stack.push(combine(items, code_ === OP_CODES.all ? FALSE : TRUE));

      continue;
    }

    if (code_ === OP_CODES.not) {
      const top = stack.pop() ?? UNKNOWN;

      stack.push(top === UNKNOWN ? UNKNOWN : ((1 - top) as Tri));

      continue;
    }

    const tests: Record<number, (v: FactValue) => boolean> = {
      [OP_CODES.eqNum]: (v) => Math.abs(v.num - b) < Number.EPSILON,
      [OP_CODES.eqSym]: (v) => v.name !== null && v.name === plan.symbols[b],
      [OP_CODES.atLeast]: (v) => v.num >= b,
      [OP_CODES.atMost]: (v) => v.num <= b,
    };

    stack.push(leaf(a, tests[code_]));
  }

  return stack.pop() ?? UNKNOWN;
}

function latency(op: PlanOp, text: string): number {
  const byKind: Record<string, number> = {
    say: sayMs(text),
    infer: INFER_MS,
    ask: ASK_MS,
    do: SKILL_MS,
    wait: op.ms ?? 0,
  };

  return byKind[op.kind] ?? 0;
}

export class PlanModel {
  readonly result: Expected = {
    says: [],
    body: [],
    visits: [],
    timeouts: [],
    ended: 'done',
    durationMs: 0,
    joinAny: false,
    reached: new Set(),
    startMs: new Map(),
    fails: 0,
  };
  readonly facts: Map<number, FactValue>;

  private readonly plan: Plan;
  private readonly assumed: Assumed;

  constructor(plan: Plan, assumed: Assumed) {
    this.plan = plan;
    this.assumed = assumed;
    this.facts = new Map(assumed.world);
  }

  run(entry: number): Expected {
    this.result.ended = this.walk(entry) === END ? 'done' : 'abandoned';

    return this.result;
  }

  walk(start: number): number {
    let pc = start;

    while (pc >= 0) pc = this.step(this.plan.ops[pc]);

    return pc;
  }

  private step(op: PlanOp): number {
    if (op.kind === 'if') {
      const taken = evalCond(this.plan, this.plan.conds[op.test ?? 0], this.facts) === TRUE;

      this.result.visits.push(`${op.node}:${taken ? 'then' : 'else'}`);
      this.result.reached.add(`${op.node}:${taken ? 'then' : 'else'}`);

      return (taken ? op.then : op.else) ?? END;
    }

    if (op.kind === 'together') return this.together(op);

    return this.guarded(op);
  }

  private together(op: PlanOp): number {
    const ends = (op.branches ?? []).map((b) => this.walk(b));
    const ok = op.joinAny ? ends.includes(END) : ends.every((e) => e === END);

    this.result.joinAny ||= !!op.joinAny;

    return ok ? op.next : ABANDON;
  }

  private isStale(op: PlanOp): boolean {
    return op.kind === 'say' && (op.needs ?? []).some((f) => !this.facts.has(f));
  }

  private outcomeOf(op: PlanOp): Outcome {
    const decided = this.assumed.decisions.get(op.node) ?? 'ok';

    if (this.isStale(op)) return 'fail';

    if (decided === 'garbage' && op.kind !== 'ask') return 'fail';

    return decided;
  }

  private guarded(op: PlanOp): number {
    const outcome = this.outcomeOf(op);

    this.result.startMs.set(op.node, this.result.durationMs);

    const stale = this.isStale(op);
    const text = op.kind === 'say' ? renderText(this.plan.texts[op.text ?? 0], (f) => this.facts.get(f)) : '';

    this.result.reached.add(`${op.node}:${outcome}`);

    if (!stale) this.result.visits.push(op.node);

    if (op.kind === 'say' && !stale) this.result.says.push(text);

    this.applyEffects(op, outcome);

    if (outcome === 'timeout') {
      this.result.timeouts.push({ node: op.node, ms: op.timeoutMs });
      this.result.durationMs += op.timeoutMs;

      return op.onTimeout;
    }

    this.result.durationMs += latency(op, text);
    this.result.fails += Number(outcome !== 'ok');

    return outcome === 'ok' ? op.next : op.onFail;
  }

  private trackBody(op: PlanOp, outcome: Outcome) {
    if (op.kind !== 'do' || !((op.holds ?? 0) & 1)) return;

    const skill = skillName(this.plan, op.skill);

    this.result.body.push(skill);

    if (outcome !== 'ok') this.result.body.push(stopViaOf(this.plan, skill));
  }

  private applyEffects(op: PlanOp, outcome: Outcome) {
    this.trackBody(op, outcome);

    if (op.kind !== 'infer' && op.kind !== 'ask') return;

    if (outcome !== 'ok') {
      this.facts.delete(op.fact ?? -1);

      return;
    }

    this.facts.set(op.fact ?? -1, this.produced(op));
  }

  private produced(op: PlanOp): FactValue {
    const mock = this.assumed.mocks[op.node];

    if (op.kind === 'infer') {
      const r = inferResult(this.plan, op, mock);

      return { num: r.num, name: r.name };
    }

    const answers = (op.answers ?? []).map((s) => this.plan.symbols[s]);
    const value = typeof mock === 'object' ? mock.value : mock;
    const index = Math.max(0, answers.indexOf(String(value)));

    return { num: index, name: answers[index] ?? null };
  }
}
