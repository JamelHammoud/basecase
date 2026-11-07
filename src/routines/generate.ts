import {
  baseSkill,
  emptySetup,
  model,
  reactionExpectations,
  scenario,
  secondsFor,
  type Setup,
  T0,
  trigger,
  withRoute,
} from './generateBuild';
import { extraFamilies } from './generateFamilies';
import type { Outcome } from './generateModel';
import { reachableFrom, routeTo } from './generatePaths';
import type { Plan, PlanOp } from './planTypes';
import type { Scenario } from './scenarioTypes';

const IDLE_SECONDS = 10;
const LABEL: Record<string, string> = {
  ok: 'runs',
  timeout: 'times out',
  fail: 'fails',
  garbage: 'answers off the list',
  then: 'is true',
  else: 'is false',
};

function outcomesFor(op: PlanOp): string[] {
  const byKind: Record<string, string[]> = {
    if: ['then', 'else'],
    together: [],
    wait: ['ok', 'timeout'],
    ask: ['ok', 'timeout', 'fail', 'garbage'],
  };

  return byKind[op.kind] ?? ['ok', 'timeout', 'fail'];
}

function idle(plan: Plan): Scenario {
  const base = baseSkill(plan);

  return scenario('idle: only the base runs', emptySetup(), IDLE_SECONDS, [
    { saidExactly: [] },
    { skills: [base] },
    { always: { skill: base } },
    { event: 'fired', count: 0 },
  ]);
}

function targetSetup(plan: Plan, reaction: number, pc: number, outcome: string): Setup | null {
  const route = routeTo(plan, plan.reactions[reaction].entry, pc);
  const start = trigger(plan, reaction, emptySetup());

  if (!route || !start) return null;

  if (outcome === 'then' || outcome === 'else') route.wants.set(pc, outcome === 'then');
  else route.decisions.set(plan.ops[pc].node, outcome as Outcome);

  return withRoute(plan, start, route);
}

function reactionTargets(plan: Plan, reaction: number): Scenario[] {
  const r = plan.reactions[reaction];
  const out: Scenario[] = [];
  const seen = new Set<string>();

  for (const pc of reachableFrom(plan, r.entry)) {
    const op = plan.ops[pc];

    for (const outcome of outcomesFor(op)) {
      const setup = targetSetup(plan, reaction, pc, outcome);
      const expected = setup && model(plan, setup, r.entry);

      if (!setup || !expected?.reached.has(`${op.node}:${outcome}`)) continue;

      const covers = `${r.id}: ${op.node} ${LABEL[outcome]}`;
      const built = scenario(covers, setup, secondsFor(expected), reactionExpectations(plan, reaction, expected));
      const key = JSON.stringify([built.world, built.mocks, built.faults]);

      if (seen.has(key)) continue;

      seen.add(key);
      out.push(built);
    }
  }

  return out;
}

function thresholdTargets(plan: Plan, reaction: number): Scenario[] {
  const r = plan.reactions[reaction];

  return reachableFrom(plan, r.entry).flatMap((pc) => {
    const op = plan.ops[pc];
    const cond = op.kind === 'if' ? JSON.stringify(plan.condSources[op.test ?? 0]) : '';

    if (!/"at(Least|Most)"/.test(cond)) return [];

    return [true, false].flatMap((want) => {
      const route = routeTo(plan, r.entry, pc);
      const start = trigger(plan, reaction, emptySetup());

      if (!route || !start) return [];

      route.wants.set(pc, want);

      const setup = withRoute(plan, start, route, true);
      const expected = setup && model(plan, setup, r.entry);

      if (!setup || !expected) return [];

      const covers = `${r.id}: ${op.node} ${want ? 'right at' : 'just past'} its threshold`;

      return [scenario(covers, setup, secondsFor(expected), reactionExpectations(plan, reaction, expected))];
    });
  });
}

export function generateScenarios(plan: Plan): Scenario[] {
  const perReaction = plan.reactions.flatMap((_, i) => [...reactionTargets(plan, i), ...thresholdTargets(plan, i)]);
  const all = [idle(plan), ...perReaction, ...extraFamilies(plan)];
  const covers = new Set<string>();

  return all.filter((s) => !covers.has(s.covers) && covers.add(s.covers));
}

export { T0 };
