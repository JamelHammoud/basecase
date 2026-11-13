import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPONENTS } from '../../src/data/components';
import { canonicalJson } from '../../src/routines/hash';
import { planHash } from '../../src/routines/compile';
import type { Plan } from '../../src/routines/planTypes';
import type { ScenarioResult, TraceEvent } from '../../src/routines/scenarioTypes';
import type { Routine, RoutineError } from '../../src/routines/schema';
import { greetingRoutine, runScenario } from '../../src/routines/testing';
import { DEFAULT_PROJECT, type ScenePart } from '../../src/types/robotics';
import { openApp, PLAY_RAIL, playTab, type App } from '../../e2e/harness';
import { need } from '../lib/need';
import { ACCEPTANCE, acceptanceProblems, SENTENCE } from './acceptance';
import { startAgentLoop, toolNames, type AgentLoop } from './agentLoop';
import { greeter, greeterWithoutCamera, greeterWithoutHead } from './greeter';
import { FLOW_MODULE, type FlowModule, type PhysicsRobot } from './interfaces';

const MAX_ACTIONS = 7;
const CAMERA_GROUPS = new Set(['Cameras', 'Depth Cameras']);

interface RoutineState {
  routine: Routine | null;
  compiled: { ok: boolean; errors?: RoutineError[]; plan?: Plan } | null;
  tests: { passed: boolean; scenarios: Array<{ covers: string; passed: boolean }> } | null;
  run: { live: boolean; done: boolean; trace: TraceEvent[]; said: string[] } | null;
}

interface Studio {
  load: (record: unknown) => void;
  parts: () => ScenePart[];
  routineState: () => RoutineState;
  simState: () => { stats: { robots: Array<{ travelled: number }> } | null };
}

let app: App;
let agent: AgentLoop;
let uiActions = 0;

const studio = <T>(fn: (s: Studio) => T) =>
  app.page.evaluate(`(${fn.toString()})(window.__studio)`) as Promise<Awaited<T>>;

const routineState = () => studio((s) => s.routineState());

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

async function load(robot: PhysicsRobot) {
  const record = { name: robot.id, parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints } };

  await app.page.evaluate((r) => (window as unknown as { __studio: Studio }).__studio.load(r), record);
  await expect.poll(() => studio((s) => s.parts().length)).toBe(robot.parts.length);
}

async function click(selector: string) {
  uiActions += 1;
  await app.page.locator(visible(selector)).first().click();
}

async function openRoutines() {
  const rail = app.page.locator(visible(PLAY_RAIL)).first();

  if ((await rail.getAttribute('aria-pressed')) !== 'true') await click(PLAY_RAIL);

  await click(playTab('Routines'));
}

const domNodes = () =>
  app.page.$$eval('[data-testid="routine-flow"] [data-flow-node]', (els) =>
    els.map((e) => ({ id: e.getAttribute('data-flow-node') ?? '', state: e.getAttribute('data-state') ?? '' })),
  );

const domEdges = () =>
  app.page.$$eval('[data-testid="routine-flow"] [data-flow-edge]', (els) =>
    els.map((e) => `${e.getAttribute('data-from')}>${e.getAttribute('data-to')}:${e.getAttribute('data-kind')}`),
  );

async function watchLiveRun(lit: Set<string>) {
  const lengths = new Set<number>();
  const deadline = Date.now() + 120000;
  let state = await routineState();

  while (!state.run?.done && Date.now() < deadline) {
    for (const n of await domNodes()) lit.add(`${n.id}:${n.state}`);

    lengths.add(state.run?.trace.length ?? 0);
    await app.page.waitForTimeout(100);
    state = await routineState();
  }

  return { state, lengths };
}

beforeAll(async () => {
  app = await openApp();
  agent = await startAgentLoop(app.page);
}, 180000);

afterAll(async () => {
  await agent?.close();
  await app?.close();
});

describe('Routines in the app', () => {
  it('offers the agent make_routine, test_routine and run_routine', async () => {
    expect(await toolNames()).toEqual(expect.arrayContaining(['make_routine', 'test_routine', 'run_routine']));
  });

  it('goes from one sentence to a compiled Routine that passes its scenarios, in under 8 actions', async () => {
    const { routineToFlow, lightFlow } = await need<FlowModule>(FLOW_MODULE, ['routineToFlow', 'lightFlow']);

    await load(greeter());
    uiActions = 0;

    const before = agent.calls();
    const made = await agent.call('make_routine', { sentence: SENTENCE, routine: greetingRoutine() });

    expect(made.ok, JSON.stringify(made)).toBe(true);

    const tested = await agent.call('test_routine', {});
    const scenarios = (tested.scenarios ?? []) as Array<{ passed: boolean }>;

    expect(tested.passed, JSON.stringify(tested).slice(0, 2000)).toBe(true);
    expect(scenarios.length).toBeGreaterThanOrEqual(4);
    expect(scenarios.every((s) => s.passed)).toBe(true);

    await openRoutines();

    const flow = routineToFlow(greetingRoutine());

    await expect
      .poll(async () => (await domNodes()).map((n) => n.id).sort())
      .toEqual(flow.nodes.map((n) => n.id).sort());
    expect((await domEdges()).sort()).toEqual(flow.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort());

    const state = await routineState();
    const plan = state.compiled?.plan;

    expect(canonicalJson(state.routine)).toBe(canonicalJson(greetingRoutine()));
    expect(state.compiled?.ok).toBe(true);

    if (!plan) throw new Error('The app holds no compiled plan');

    expect(planHash(plan)).toBe(plan.hash);

    for (const a of ACCEPTANCE) expect(acceptanceProblems(a, await runScenario(plan, a.scenario))).toEqual([]);

    const started = await agent.call('run_routine', { scenario: ACCEPTANCE[0].scenario, live: true });

    expect(started.started, JSON.stringify(started)).toBe(true);

    const lit = new Set<string>();
    const { state: after, lengths } = await watchLiveRun(lit);
    const run = after.run;

    if (!run?.done) throw new Error('The live run never finished');

    const lighting = lightFlow(flow, run.trace);
    const finalDom = Object.fromEntries((await domNodes()).map((n) => [n.id, n.state]));
    const result: ScenarioResult = { ...run, passed: true, maxControlGapMs: 0, controlTicks: 0, failures: [] };

    expect(run.live).toBe(true);
    expect(lengths.size, 'the trace grew while the robot moved').toBeGreaterThanOrEqual(3);
    expect(lit.has('recognize:active'), 'Check Face lit while it ran').toBe(true);
    expect(lighting.rejected).toEqual([]);

    for (const [id, s] of Object.entries(lighting.states)) expect(finalDom[id], id).toBe(s);

    expect(acceptanceProblems(ACCEPTANCE[0], result)).toEqual([]);
    expect((await studio((s) => s.simState())).stats?.robots[0]?.travelled ?? 0).toBeGreaterThan(0.05);
    expect(agent.calls() - before + uiActions).toBeLessThanOrEqual(MAX_ACTIONS);
    expect(app.errors).toEqual([]);
  });

  it('offers Add Camera instead of a vision node on a robot with no camera', async () => {
    await load(greeterWithoutCamera());

    const made = await agent.call('make_routine', { sentence: SENTENCE, routine: greetingRoutine() });
    const errors = (made.errors ?? []) as RoutineError[];

    expect(made.ok).toBe(false);
    expect(errors.some((e) => e.code === 'missing-capability')).toBe(true);
    expect((await agent.call('test_routine', {})).passed).toBe(false);

    await openRoutines();

    const partsBefore = await studio((s) => s.parts().length);

    await click('[data-testid="routine-flow"] button:has-text("Add Camera")');
    await expect.poll(() => studio((s) => s.parts().length)).toBe(partsBefore + 1);

    const parts = await studio((s) => s.parts());
    const added = parts.filter((p) => COMPONENTS.find((c) => c.id === p.componentId && CAMERA_GROUPS.has(c.group)));

    expect(added).toHaveLength(1);
    await expect.poll(async () => (await routineState()).compiled?.ok, { timeout: 30000 }).toBe(true);
  });

  it('offers Train on a skill the Kit cannot run, and refuses to run the Routine', async () => {
    await load(greeterWithoutHead());

    const made = await agent.call('make_routine', { sentence: SENTENCE, routine: greetingRoutine() });
    const errors = (made.errors ?? []) as RoutineError[];

    expect(made.ok).toBe(false);
    expect(errors.some((e) => e.code === 'needs-training' && e.path === 'lookAt')).toBe(true);

    await openRoutines();

    const node = app.page.locator(visible('[data-testid="routine-flow"] [data-flow-node="lookAt"]'));

    await expect.poll(() => node.locator('button', { hasText: /^Train / }).count()).toBe(1);
    expect((await agent.call('test_routine', {})).passed).toBe(false);
    expect((await agent.call('run_routine', { scenario: ACCEPTANCE[0].scenario, live: true })).started).not.toBe(true);
  });
});
