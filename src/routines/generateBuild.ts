import { type Assumed, type Expected, type Outcome, PlanModel, skillName, stopViaOf } from './generateModel';
import { type Assignment, type Route, solve, toFactValue, toMock } from './generatePaths';
import type { Plan } from './planTypes';
import type { Expectation, Fault, MockValue, Scenario, WorldChange } from './scenarioTypes';
import type { FactValue } from './traceDecode';

export const T0 = 1.01;
export const STOP_ALLOWANCE_MS = 2000;

const SLACK_S = 3;
const FAULT_KIND: Record<Outcome, Fault['kind'] | null> = {
  ok: null,
  timeout: 'hang',
  fail: 'fail',
  garbage: 'garbage',
};

export interface Setup {
  world: WorldChange[];
  mocks: Record<string, MockValue>;
  faults: Fault[];
  facts: Map<number, FactValue>;
  decisions: Map<string, Outcome>;
}

export const emptySetup = (): Setup => ({ world: [], mocks: {}, faults: [], facts: new Map(), decisions: new Map() });

export const baseSkill = (plan: Plan) => skillName(plan, plan.base.skill);

export function dedupe(list: string[]): string[] {
  return list.filter((s, i) => s !== list[i - 1]);
}

export function apply(plan: Plan, setup: Setup, assignment: Assignment, at: number): Setup {
  const next = { ...setup, world: [...setup.world], mocks: { ...setup.mocks }, facts: new Map(setup.facts) };

  for (const [fact, value] of assignment) {
    const info = plan.facts.find((f) => f.id === fact);

    if (!info) continue;

    if (info.source === 'watcher')
      next.world.push({ at, fact, value: typeof value === 'object' ? value.score : value });
    else next.mocks[fact] = toMock(value);

    if (info.source === 'watcher') next.facts.set(plan.facts.indexOf(info), toFactValue(value));
  }

  return next;
}

export function trigger(plan: Plan, reaction: number, setup: Setup, at = T0): Setup | null {
  const r = plan.reactions[reaction];
  const assignment = solve({ plan, near: false }, plan.condSources[r.when], true);

  return assignment ? apply(plan, setup, assignment, at) : null;
}

export function withRoute(plan: Plan, setup: Setup, route: Route, near = false): Setup | null {
  let next: Setup = { ...setup, decisions: new Map([...setup.decisions, ...route.decisions]) };

  for (const [pc, want] of route.wants) {
    const assignment = solve({ plan, near }, plan.condSources[plan.ops[pc].test ?? 0], want);

    if (!assignment) return null;

    next = apply(plan, next, assignment, 0);
  }

  return next;
}

export function faultsFor(decisions: Map<string, Outcome>): Fault[] {
  return [...decisions].flatMap(([node, outcome]) => {
    const kind = FAULT_KIND[outcome];

    return kind ? [{ node, at: 0, kind }] : [];
  });
}

export function model(plan: Plan, setup: Setup, entry: number): Expected {
  const assumed: Assumed = { decisions: setup.decisions, mocks: setup.mocks, world: setup.facts };

  return new PlanModel(plan, assumed).run(entry);
}

export function triggerPeriodS(plan: Plan, reaction: number): number {
  const leaves = JSON.stringify(plan.condSources[plan.reactions[reaction].when]);
  const rates = plan.watchers.filter((w) => leaves.includes(`"${w.id}"`)).map((w) => w.rateHz);

  return rates.length ? 1 / Math.min(...rates) : 0;
}

export function reactionBody(plan: Plan, reaction: number, expected: Expected): string[] {
  const base = baseSkill(plan);

  if (!plan.reactions[reaction].stopFirst) return [base];

  return dedupe([base, stopViaOf(plan, base), ...expected.body, base]);
}

export function reactionExpectations(plan: Plan, reaction: number, expected: Expected): Expectation[] {
  const r = plan.reactions[reaction];
  const list: Expectation[] = [
    { event: 'fired', reaction: r.id, count: 1 },
    { event: 'fired', reaction: r.id, from: T0, until: T0 + triggerPeriodS(plan, reaction) + 0.06 },
    { saidExactly: expected.says },
    { skills: reactionBody(plan, reaction, expected) },
    { visits: expected.visits },
    { event: 'ended', reaction: r.id, why: expected.ended, count: 1 },
    ...expected.timeouts.map((t) => ({ elapsed: { node: t.node, ms: t.ms } })),
    { event: 'opTimeout', count: expected.timeouts.length },
    { event: 'opFail', count: expected.fails },
  ];

  if (!expected.joinAny) list.push({ event: 'opCancel', count: 0 });

  if (!r.stopFirst) list.push({ always: { skill: baseSkill(plan) } });

  return list;
}

export function secondsFor(expected: Expected, startS = T0): number {
  return Math.ceil(startS + (expected.durationMs + STOP_ALLOWANCE_MS) / 1000 + SLACK_S);
}

export function scenario(covers: string, setup: Setup, seconds: number, expect: Expectation[]): Scenario {
  return {
    covers,
    world: setup.world,
    mocks: setup.mocks,
    faults: [...setup.faults, ...faultsFor(setup.decisions)],
    seconds,
    expect,
  };
}
