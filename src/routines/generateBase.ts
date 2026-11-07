import { baseSkill, dedupe, emptySetup, model, scenario, type Setup } from './generateBuild';
import { type Expected, type Outcome, stopViaOf } from './generateModel';
import { reachableFrom } from './generatePaths';
import type { Plan } from './planTypes';
import type { Expectation, Scenario } from './scenarioTypes';

const FAIL_AT_S = 2;
const SLACK_S = 3;
const OUTCOMES: Outcome[] = ['ok', 'timeout', 'fail'];
const EMPTY: Expected = {
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

type Ending = 'timeout' | 'failed';

function expectEnding(plan: Plan, ending: Ending, expected: Expected, atS: number): Expectation[] {
  const base = baseSkill(plan);
  const safe = plan.skills[plan.safeStop]?.id ?? base;
  const why = ending === 'timeout' ? 'base timed out' : 'base failed';

  return [
    { event: 'baseEnd', why: ending, from: atS, until: atS + 0.11, count: 1 },
    { event: 'safeStop', why, count: 1 },
    { saidExactly: expected.says },
    { skills: dedupe([base, stopViaOf(plan, base), ...expected.body, safe]) },
    ...expected.timeouts.map((t) => ({ elapsed: { node: t.node, ms: t.ms } })),
  ];
}

function variants(plan: Plan, entry: number): { label: string; decisions: Map<string, Outcome> }[] {
  const pcs = entry >= 0 ? reachableFrom(plan, entry).filter((pc) => plan.ops[pc].kind !== 'if') : [];
  const extra = pcs.flatMap((pc) =>
    OUTCOMES.filter((o) => o !== 'ok').map((o) => ({
      label: `${plan.ops[pc].node} ${o === 'timeout' ? 'times out' : 'fails'}`,
      decisions: new Map([[plan.ops[pc].node, o]]),
    })),
  );

  return [{ label: '', decisions: new Map() }, ...extra];
}

function ending(plan: Plan, kind: Ending): Scenario[] {
  const entry = kind === 'timeout' ? plan.base.onTimeout : plan.base.onFail;
  const atS = kind === 'timeout' ? plan.base.timeoutMs / 1000 : FAIL_AT_S;
  const fault = { node: plan.base.node, at: FAIL_AT_S, kind: 'fail' as const };
  const name = kind === 'timeout' ? 'base runs out of time' : 'base fails';

  return variants(plan, entry).map(({ label, decisions }) => {
    const setup: Setup = { ...emptySetup(), decisions, faults: kind === 'failed' ? [fault] : [] };
    const expected = entry >= 0 ? model(plan, setup, entry) : EMPTY;
    const seconds = Math.ceil(atS + expected.durationMs / 1000 + SLACK_S);

    return scenario(label ? `${name}: ${label}` : name, setup, seconds, expectEnding(plan, kind, expected, atS));
  });
}

export function baseFamilies(plan: Plan): Scenario[] {
  return [...ending(plan, 'timeout'), ...ending(plan, 'failed')];
}
