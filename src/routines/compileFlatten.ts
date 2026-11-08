import type { CompileContext, FactInfo } from './compileContext';
import { lowerCondition, Symbols } from './compileConditions';
import type { FlowChecker } from './compileFlow';
import { askNodeFor } from './nodes';
import {
  ABANDON,
  CONTROL_DEADLINE_MS,
  END,
  type Instr,
  maskOf,
  type Plan,
  type PlanOp,
  type PlanText,
  STOP_TIMEOUT_MS,
} from './planTypes';
import type { Condition, Step } from './schema';
import { isGuarded } from './schema';

const INTERRUPT = { any: 0, atPhase: 1, never: 2 } as const;
const RETRIGGER = { ignore: 0, restart: 1, queue: 2 } as const;

type Draft = Omit<PlanOp, 'next' | 'onTimeout' | 'onFail' | 'then' | 'else' | 'branches'> & {
  next: number;
  onTimeout: number;
  onFail: number;
  then?: number;
  else?: number;
  branches?: number[];
};

class Flattener {
  readonly drafts: Draft[] = [];
  readonly symbols = new Symbols();
  readonly conds: Instr[][] = [];
  readonly condSources: Condition[] = [];
  readonly texts: PlanText[] = [];
  readonly skillIndex: Map<string, number>;
  private owner = -1;

  private readonly ctx: CompileContext;
  private readonly flow: FlowChecker;

  constructor(ctx: CompileContext, flow: FlowChecker) {
    this.ctx = ctx;
    this.flow = flow;
    this.skillIndex = new Map([...ctx.skills.keys()].map((id, i) => [id, i]));
  }

  cond(cond: Condition): number {
    this.conds.push(lowerCondition(this.ctx, cond, this.symbols));
    this.condSources.push(cond);

    return this.conds.length - 1;
  }

  fact(id: string): number {
    return (this.ctx.facts.get(id) as FactInfo).index;
  }

  private push(draft: Draft): number {
    this.drafts.push(draft);

    return this.drafts.length - 1;
  }

  sequence(steps: Step[], cont: number, owner: number): number {
    this.owner = owner;

    return steps.reduceRight((next, step) => this.emit(step, next), cont);
  }

  private emit(step: Step, next: number): number {
    const owner = this.owner;
    const guard = isGuarded(step)
      ? {
          timeoutMs: step.timeoutMs,
          onTimeout: this.sequence(step.onTimeout, ABANDON, owner),
          onFail: this.sequence(step.onFail, ABANDON, owner),
        }
      : { timeoutMs: 0, onTimeout: ABANDON, onFail: ABANDON };

    this.owner = owner;

    const common = { kind: step.kind, node: this.ctx.nodeOf(step), owner, next, ...guard };

    return this.push({ ...common, ...this.fields(step, next) });
  }

  private fields(step: Step, next: number): Partial<Draft> {
    const owner = this.owner;

    switch (step.kind) {
      case 'do':
        return {
          skill: this.skillIndex.get(step.skill),
          holds: maskOf(step.holds),
          ...(step.move ? { move: { ...step.move } } : {}),
        };
      case 'say':
        return this.say(step);
      case 'infer':
        return { fact: this.fact(this.ctx.nodeOf(step)), model: step.model, input: step.input };
      case 'ask':
        return {
          fact: this.fact(this.ctx.nodeOf(step)),
          model: askNodeFor(step.input).id,
          prompt: step.prompt,
          answers: step.answers.map((a) => this.symbols.id(a)),
          ...(step.input === undefined ? {} : { input: step.input }),
        };
      case 'wait':
        return { until: step.until ? this.cond(step.until) : -1, ms: step.ms ?? 0 };
      case 'if': {
        const test = this.cond(step.test);
        const then = this.sequence(step.then, next, owner);
        const otherwise = this.sequence(step.else, next, owner);

        this.owner = owner;

        return { test, then, else: otherwise, next: END };
      }
      default: {
        const branches = step.branches.map((b) => this.sequence(b, END, owner));

        this.owner = owner;

        return { branches, joinAny: step.join === 'any' };
      }
    }
  }

  private say(step: Extract<Step, { kind: 'say' }>): Partial<Draft> {
    const slots = (this.flow.slots.get(step) ?? []).map((s) => ({ ...s, fact: this.fact(s.fact) }));

    this.texts.push({ template: step.text, slots });

    return { text: this.texts.length - 1, needs: [...new Set(slots.map((s) => s.fact))] };
  }
}

const renumber = (count: number) => (pc: number | undefined) => (pc === undefined || pc < 0 ? pc : count - 1 - pc);

function finalOps(drafts: Draft[]): PlanOp[] {
  const map = renumber(drafts.length);

  return [...drafts].reverse().map((d) => {
    const op: PlanOp = {
      ...d,
      next: map(d.next) as number,
      onTimeout: map(d.onTimeout) as number,
      onFail: map(d.onFail) as number,
    };

    if (d.then !== undefined) op.then = map(d.then);

    if (d.else !== undefined) op.else = map(d.else);

    if (d.branches) op.branches = d.branches.map((b) => map(b) as number);

    return op;
  });
}

export function flatten(ctx: CompileContext, flow: FlowChecker): Plan {
  const f = new Flattener(ctx, flow);
  const routine = ctx.routine;
  const watchers = routine.watchers.map((w) => ({
    id: w.id,
    model: w.model,
    rateHz: w.rateHz,
    maxAgeMs: w.maxAgeMs,
    fact: f.fact(w.id),
    when: w.when ? f.cond(w.when) : -1,
  }));
  const reactions = routine.reactions.map((r, i) => ({
    id: r.id,
    when: f.cond(r.when),
    cooldownMs: r.cooldownMs,
    retrigger: RETRIGGER[r.onRetrigger],
    stopFirst: r.body === 'stopFirst',
    entry: f.sequence(r.steps, END, i),
  }));
  const onTimeout = f.sequence(routine.base.onTimeout, ABANDON, -1);
  const onFail = f.sequence(routine.base.onFail, ABANDON, -1);
  const map = renumber(f.drafts.length);
  const skills = [...ctx.skills.values()].map((s) => ({
    id: s.id,
    holds: maskOf(s.holds),
    interrupt: INTERRUPT[s.interrupt],
    stopVia: f.skillIndex.get(s.stopVia) ?? 0,
  }));

  return {
    schema: 1,
    routine: { id: routine.id, name: routine.name, ...(routine.sentence ? { sentence: routine.sentence } : {}) },
    requires: [...routine.requires],
    facts: [...ctx.facts.values()].map(({ id, type, maxAgeMs, source }) => ({ id, type, maxAgeMs, source })),
    skills,
    symbols: f.symbols.list,
    texts: f.texts,
    conds: f.conds,
    condSources: f.condSources,
    ops: finalOps(f.drafts),
    reactions: reactions.map((r) => ({ ...r, entry: map(r.entry) as number })),
    watchers,
    base: {
      node: ctx.nodeOf(routine.base),
      skill: f.skillIndex.get(routine.base.skill) ?? 0,
      timeoutMs: routine.base.timeoutMs,
      onTimeout: map(onTimeout) as number,
      onFail: map(onFail) as number,
    },
    safeStop: f.skillIndex.get(routine.safeStop) ?? 0,
    stopTimeoutMs: STOP_TIMEOUT_MS,
    controlDeadlineMs: CONTROL_DEADLINE_MS,
    transitions: [...flow.edges].sort(),
    hash: '',
  };
}
