import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/routines/hash';
import type { TraceEvent } from '../../src/routines/scenarioTypes';
import { type Routine, type Step, forEachStep, validateRoutine } from '../../src/routines/schema';
import { compileRoutine, greetingRoutine, mutate, runScenario } from '../../src/routines/testing';
import { need } from '../lib/need';
import { ACCEPTANCE } from './acceptance';
import { type Flow, FLOW_MODULE, type FlowModule, GUARDED_KINDS, type NodeState, STEP_KINDS } from './interfaces';

const flowModule = () => need<FlowModule>(FLOW_MODULE, ['routineToFlow', 'flowToRoutine', 'lightFlow']);

const same = (a: unknown, b: unknown) => expect(canonicalJson(a)).toBe(canonicalJson(b));

function withoutStepIds(routine: Routine): Routine {
  const copy = structuredClone(routine);
  const strip = (s: Step) => delete s.id;

  forEachStep([copy.base, ...copy.reactions.flatMap((r) => r.steps)], strip);

  return copy;
}

function validMutants(count: number): Routine[] {
  const found: Routine[] = [];

  for (let seed = 0; found.length < count && seed < count * 4; seed++) {
    const m = mutate(greetingRoutine(), seed);

    if (validateRoutine(m).ok) found.push(m);
  }

  return found;
}

const OP_STATE: Record<string, NodeState> = {
  opStart: 'active',
  opDone: 'done',
  opFail: 'failed',
  opTimeout: 'timedOut',
  opCancel: 'cancelled',
};

const LIT_KINDS = [...STEP_KINDS, 'reaction', 'watcher'];

const litNodes = (flow: Flow) => flow.nodes.filter((n) => LIT_KINDS.includes(n.kind)).map((n) => n.id);

const pick = (states: Record<string, NodeState>, ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, states[id]]));

function expectedStates(flow: Flow, trace: TraceEvent[]): Record<string, NodeState> {
  const states: Record<string, NodeState> = Object.fromEntries(litNodes(flow).map((id) => [id, 'idle' as NodeState]));

  for (const e of trace) {
    if (e.node && OP_STATE[e.kind]) states[e.node] = OP_STATE[e.kind];
    else if (e.node && e.kind === 'branch') states[e.node] = e.taken ? 'then' : 'else';
    else if (e.reaction && e.kind === 'fired') states[e.reaction] = 'active';
    else if (e.reaction && e.kind === 'ended') states[e.reaction] = 'done';
  }

  return states;
}

async function knownTrace() {
  const compiled = compileRoutine(greetingRoutine());

  if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

  return (await runScenario(compiled.plan, ACCEPTANCE[0].scenario)).trace;
}

describe('the flow is the Routine, drawn', () => {
  it('round-trips the greeting, a copy without step ids, and 100 valid mutants exactly', async () => {
    const { routineToFlow, flowToRoutine } = await flowModule();
    const routines = [greetingRoutine(), withoutStepIds(greetingRoutine()), ...validMutants(100)];

    expect(routines.length).toBeGreaterThanOrEqual(80);

    for (const r of routines) same(flowToRoutine(structuredClone(routineToFlow(r))), r);
  });

  it('names step nodes the way the compiler names plan ops, and edges join nodes that exist', async () => {
    const { routineToFlow } = await flowModule();

    for (const routine of [greetingRoutine(), withoutStepIds(greetingRoutine())]) {
      const compiled = compileRoutine(routine);

      if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

      const flow = routineToFlow(routine);
      const ids = flow.nodes.map((n) => n.id);
      const steps = flow.nodes.filter((n) => STEP_KINDS.includes(n.kind)).map((n) => n.id);
      const plan = compiled.plan;

      expect(new Set(ids).size).toBe(ids.length);
      expect(steps.sort()).toEqual(plan.ops.map((o) => o.node).sort());
      expect(flow.nodes.find((n) => n.kind === 'base')?.id).toBe(plan.base.node);
      expect(flow.nodes.filter((n) => n.kind === 'watcher').map((n) => n.id)).toEqual(plan.watchers.map((w) => w.id));
      expect(flow.nodes.filter((n) => n.kind === 'reaction').map((n) => n.id)).toEqual(plan.reactions.map((r) => r.id));

      for (const e of flow.edges) expect(ids, `${e.from} → ${e.to}`).toEqual(expect.arrayContaining([e.from, e.to]));
    }
  });

  it('gives every guarded node exactly one timeout path and one failure path', async () => {
    const { routineToFlow } = await flowModule();
    const flow = routineToFlow(greetingRoutine());

    for (const n of flow.nodes.filter((x) => GUARDED_KINDS.includes(x.kind))) {
      const out = flow.edges.filter((e) => e.from === n.id);

      expect(
        out.filter((e) => e.kind === 'timeout'),
        `${n.id} timeout`,
      ).toHaveLength(1);
      expect(
        out.filter((e) => e.kind === 'fail'),
        `${n.id} fail`,
      ).toHaveLength(1);
    }
  });

  it('carries an edit made in the flow into the Routine, and nowhere else', async () => {
    const { routineToFlow, flowToRoutine } = await flowModule();
    const flow = routineToFlow(greetingRoutine());
    const node = flow.nodes.find((n) => n.id === 'helloName');

    if (!node) throw new Error('No helloName node in the flow');

    node.data.text = 'Hi {name}';

    const edited = flowToRoutine(flow);
    const expected = JSON.parse(JSON.stringify(greetingRoutine()).replace('"Hello {name}"', '"Hi {name}"'));

    same(edited, expected);
    expect(compileRoutine(edited).ok).toBe(true);
  });

  it('a flow edit that drops a timeout path is refused by the compiler', async () => {
    const { routineToFlow, flowToRoutine } = await flowModule();

    for (const id of ['recognize', 'lookAt']) {
      const flow = routineToFlow(greetingRoutine());

      flow.edges = flow.edges.filter((e) => !(e.from === id && e.kind === 'timeout'));

      const r = compileRoutine(flowToRoutine(flow));

      expect(r.ok, id).toBe(false);
      expect(
        r.errors?.some((e) => e.code === 'missing-timeout' && /onTimeout/.test(e.path ?? '')),
        id,
      ).toBe(true);
    }
  });
});

describe('trace lighting', () => {
  it('lights nodes from coordinator trace events, at every point of a run', async () => {
    const { routineToFlow, lightFlow } = await flowModule();
    const flow = routineToFlow(greetingRoutine());
    const trace = await knownTrace();
    const recognizeStart = trace.findIndex((e) => e.kind === 'opStart' && e.node === 'recognize');

    expect(recognizeStart).toBeGreaterThan(0);

    for (const cut of [recognizeStart + 1, Math.floor(trace.length / 2), trace.length]) {
      const lit = lightFlow(flow, trace.slice(0, cut));

      expect(lit.rejected).toEqual([]);
      expect(pick(lit.states, litNodes(flow))).toEqual(expectedStates(flow, trace.slice(0, cut)));
    }

    expect(lightFlow(flow, trace.slice(0, recognizeStart + 1)).states.recognize).toBe('active');
    expect(lightFlow(flow, trace).states.greet).toBe('done');
    expect(lightFlow(flow, trace).states.known).toBe('then');
  });

  it('rejects a trace event for a node that is not in the graph, and changes nothing', async () => {
    const { routineToFlow, lightFlow } = await flowModule();
    const flow = routineToFlow(greetingRoutine());
    const trace = await knownTrace();
    const ghosts: TraceEvent[] = [
      { t: 7000, kind: 'opStart', node: 'ghost', token: 999 },
      { t: 7001, kind: 'fired', reaction: 'ghostReaction' },
      { t: 7002, kind: 'branch', node: 'ghostIf', taken: true },
    ];
    const clean = lightFlow(flow, trace);
    const dirty = lightFlow(flow, [...trace, ...ghosts]);

    expect(dirty.rejected).toEqual(ghosts);
    expect(dirty.states).toEqual(clean.states);
  });
});
