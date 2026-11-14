import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot, type CaseSpec } from '../cases/caseBuilder';
import { compileCaseLogic } from '../cases/caseLogic';
import type { Case } from '../cases/schema';
import type { Routine } from '../routines/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { CaseRuns } from '../cases/caseRuns';
import { designChanges, designKey, exploreSpace, type Design } from '../cases/explore';
import { servoArm } from '../sim/fixtures/servoArm';
import { DEFAULT_PROJECT } from '../types/robotics';
import { CASE_HANDLERS, caseValues } from './agentCaseRequests';
import type { Cases } from './useCases';

const scene = { parts: () => [], project: () => ({}) as ProjectSettings, viewport: () => null };

function contextFor(id: string) {
  const r = fixtureRobots().find((f) => f.id === id)!;
  const robot = builderRobot(buildRig(r.joints, r.parts), r.parts);
  const added: Case[] = [];
  const cases = {
    builder: {
      preview: (spec: CaseSpec) => buildCase(spec, robot),
      add: (spec: CaseSpec) => {
        const built = buildCase(spec, robot);

        if (built.ok) added.push(built.kase);

        return built;
      },
    },
  } as unknown as Cases;
  const routines = { checkLogic: async (logic: unknown) => compileCaseLogic(logic as Routine, { skills: [] }) };

  const caseCompare = { choicesFor: () => [], compareNow: async () => null as never, start: () => {} };
  const running: string[] = [];
  const caseRun = { enterCase: (caseId: string) => void running.push(caseId) };

  const caseExplore = { explore: async () => 'unused' };

  return { ctx: { cases, routines, caseCompare, caseExplore, caseRun, setAction: () => {}, ...scene }, added, running };
}

const create = (payload: Record<string, unknown>, id = 'rover-diff') => {
  const { ctx, added, running } = contextFor(id);

  return { reply: CASE_HANDLERS.create_case(payload, ctx), added, running };
};

const ROVER_APP = {
  input: ['gamepad', 'keys'],
  panels: [
    { id: 'front', kind: 'camera', signal: 'camera.*' },
    { id: 'speed', kind: 'value', title: 'Speed', signal: 'robot.speed' },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: { areas: [{ size: 480, panels: ['front'] }, { canvas: true }, { size: 300, panels: ['speed', 'tries'] }] },
};

describe('create_case', () => {
  it('maps the agent’s numbers onto the builder’s', () => {
    expect(caseValues({ distance_mm: 1200, stops: 4, seconds: Infinity, push_mm: '9', extra: 3 })).toEqual({
      distanceMm: 1200,
      stops: 4,
    });
  });

  it('builds the Case it describes and replies with its name and time', async () => {
    const { reply } = create({ goal: 'push', world: 'corridor', push_mm: 800, seconds: 12 });

    expect(await reply).toEqual({
      ok: true,
      id: 'push-a-box-in-a-corridor',
      name: 'Push a Box in a Corridor',
      brief: 'Push the box 800 mm onto the spot.',
      seconds: 12,
      objects: 4,
    });
  });

  it('touches several dots in order on an arm when given a dot count', async () => {
    expect(await create({ goal: 'touch', dots: 3 }, 'arm-6dof').reply).toEqual({
      ok: true,
      id: 'touch-the-dots',
      name: 'Touch the Dots',
      brief: 'Touch each dot in order with the end effector.',
      seconds: 6,
      objects: 3,
    });
  });

  it('builds a terrain world at the agent’s height or incline', async () => {
    const steps = create({ goal: 'walk', world: 'steps', rise_mm: 12 }, 'hexapod');

    expect(await steps.reply).toMatchObject({ ok: true, name: 'Walk Without Falling over Steps' });
    expect(steps.added[0].world.objects.find((o) => o.id === 'platform')?.size[1]).toBe(12);

    const slope = create({ goal: 'reach', world: 'slope', incline_deg: 20 });

    expect(await slope.reply).toMatchObject({ ok: true, name: 'Reach a Spot over a Slope' });
    expect(slope.added[0].world.objects.find((o) => o.id === 'ramp-up')?.rotation[0]).toBeCloseTo(-20);
  });

  it('adds the agent’s own objects in the agent frame', async () => {
    const { reply, added } = create({
      goal: 'reach',
      objects: [{ name: 'Ramp', kind: 'box', position: [0, -500, 20], size: [300, 200, 40], behavior: 'static' }],
    });

    expect(await reply).toMatchObject({ ok: true, objects: 2 });
    expect(added[0].world.objects.find((o) => o.name === 'Ramp')).toMatchObject({
      name: 'Ramp',
      position: [0, 20, 500],
      size: [300, 40, 200],
    });
  });

  it('keeps an object the agent marks movable movable, and only that one', async () => {
    const target = { kind: 'cylinder', position: [300, 0, 1], size: [120, 120, 2], behavior: 'marker' };
    const { reply, added } = create({
      goal: 'reach',
      objects: [
        { ...target, id: 'lit', name: 'Lit', movable: true },
        { ...target, id: 'still', name: 'Still' },
      ],
    });

    expect(await reply).toMatchObject({ ok: true, objects: 3 });

    const movable = Object.fromEntries(added[0].world.objects.map((o) => [o.id, o.movable ?? false]));

    expect(movable).toMatchObject({ lit: true, still: false });
  });

  it('answers a goal the robot cannot try, or hostile objects, with what to change', async () => {
    expect(await create({ goal: 'touch' }).reply).toEqual({ ok: false, problem: expect.stringMatching(/reach/) });
    expect(await create({ goal: 'nope' }).reply).toMatchObject({ ok: false });

    const hostile = create({
      goal: 'reach',
      objects: [{ id: '../x', name: 'X', kind: 'box', position: [0, 0, 0], size: [1, 1, 1], behavior: 'static' }],
    });

    expect(await hostile.reply).toEqual({ ok: false, problem: expect.stringMatching(/plain id/) });
    expect(hostile.added).toEqual([]);
  });

  it('runs the agent’s logic through the compiler, and refuses a Routine it refuses with its message', async () => {
    const logic = (skill: string): Routine => ({
      schema: 1,
      id: 'cheer',
      name: 'Cheer',
      requires: ['wheels'],
      base: { kind: 'do', id: 'start', skill, holds: ['body'], timeoutMs: 10000, onTimeout: [], onFail: [] },
      watchers: [{ id: 'goal-count', model: 'case-fact', rateHz: 10, maxAgeMs: 500, publishes: { type: 'number' } }],
      reactions: [],
      safeStop: skill,
    });
    const kept = create({ goal: 'reach', logic: logic('drive') });

    expect(await kept.reply).toMatchObject({ ok: true });
    expect(kept.added[0].logic?.id).toBe('cheer');

    const refused = create({ goal: 'reach', logic: logic('backflip') });
    const compiled = compileCaseLogic(logic('backflip'), { skills: [] });

    expect(compiled.ok).toBe(false);
    expect(await refused.reply).toEqual({ ok: false, problem: compiled.errors![0].message });
    expect(refused.added).toEqual([]);
  });
});

describe('create_case with a console', () => {
  it('keeps the console on the Case and opens the new Case running', async () => {
    const { reply, added, running } = create({ goal: 'reach', name: 'Drive to the Dock', console: ROVER_APP });

    expect(await reply).toMatchObject({ ok: true, id: 'drive-to-the-dock', running: true });
    expect(added[0].console).toEqual(ROVER_APP);
    expect(running).toEqual(['drive-to-the-dock']);
  });

  it('refuses a panel the format refuses, by its path, and adds and opens nothing', async () => {
    const radar = { ...ROVER_APP, panels: [...ROVER_APP.panels.slice(0, 2), { id: 'tries', kind: 'radar' }] };
    const { reply, added, running } = create({ goal: 'reach', console: radar });

    expect(await reply).toEqual({ ok: false, problem: expect.stringMatching(/^console\.panels\[2\]\.kind /) });
    expect(added).toEqual([]);
    expect(running).toEqual([]);
  });

  it('refuses an input this version lacks with the words the agent passes on', async () => {
    const midi = { ...ROVER_APP, input: ['midi'] };

    expect(await create({ goal: 'reach', console: midi }).reply).toEqual({
      ok: false,
      problem: 'console.input[0] midi can’t drive a Case in this version',
    });
  });

  it('keeps code panels in a column and over the canvas, driving through the code source', async () => {
    const joystickApp = {
      input: ['code', 'keys'],
      panels: [
        {
          id: 'stick',
          kind: 'code',
          title: 'Joystick',
          source: '<canvas></canvas><script>basecase.drive(null)</script>',
        },
        { id: 'hud', kind: 'code', source: '<p id="v"></p>', height: 120 },
      ],
      layout: {
        areas: [
          { canvas: true, overlays: [{ panel: 'hud', anchor: 'top-left', width: 220, height: 80 }] },
          { size: 320, panels: ['stick'] },
        ],
      },
    };
    const { reply, added, running } = create({ goal: 'reach', name: 'Joystick Rover', console: joystickApp });

    expect(await reply).toMatchObject({ ok: true, running: true });
    expect(added[0].console).toEqual(joystickApp);
    expect(running).toEqual(['joystick-rover']);
  });

  it('leaves a Case without a console in the studio', async () => {
    const { reply, running } = create({ goal: 'reach' });

    expect(await reply).not.toHaveProperty('running');
    expect(running).toEqual([]);
  });
});

describe('compare_case', () => {
  const rover = fixtureRobots().find((f) => f.id === 'rover-diff')!;
  const made = buildCase(
    { goal: 'reach', world: 'floor' },
    builderRobot(buildRig(rover.joints, rover.parts), rover.parts),
  );
  const kase = made.ok ? made.kase : null!;
  const runs = (passes: number): CaseRuns => ({
    runs: 20,
    passes,
    medianMargin: 0.1234,
    worstMargin: 0.05,
    commonFailure: null,
    failures: [],
    worstSeed: null,
    refusal: null,
    misfit: false,
  });
  const started: string[] = [];
  const ctxWith = (choices: Array<{ tabId: string; name: string }>, active: Case | null = kase) => ({
    cases: { cases: [kase], active } as unknown as Cases,
    routines: { checkLogic: async () => ({ ok: true }) as never },
    setAction: () => {},
    ...scene,
    caseRun: { enterCase: () => {} },
    caseExplore: { explore: async () => 'unused' },
    caseCompare: {
      choicesFor: () => choices,
      start: (tabId: string) => void started.push(tabId),
      compareNow: async (_: Case, tabId: string) => ({
        caseId: kase.id,
        robots: [
          { tabId: 'mine', name: 'Rover', runs: runs(19), costUsd: 120.5, massG: 1234.4 },
          { tabId, name: 'Rover copy', runs: runs(4), costUsd: 98, massG: 1100 },
        ],
        better: 'mine',
      }),
    },
  });

  it('runs the open Case against the first robot that fits, and names the better scene', async () => {
    const reply = await CASE_HANDLERS.compare_case({}, ctxWith([{ tabId: 'tab-2', name: 'Rover copy' }]));

    expect(reply).toEqual({
      ok: true,
      case: kase.name,
      robots: [
        { scene: 'Rover', passes: 19, runs: 20, median_margin: 0.123, cost_usd: 120.5, mass_g: 1234 },
        { scene: 'Rover copy', passes: 4, runs: 20, median_margin: 0.123, cost_usd: 98, mass_g: 1100 },
      ],
      better: 'Rover',
    });
    expect(started).toEqual(['tab-2']);
  });

  it('says why when no other open scene fits, or none is open', async () => {
    expect(await CASE_HANDLERS.compare_case({}, ctxWith([]))).toMatchObject({ ok: false, scenes: [] });
    expect(await CASE_HANDLERS.compare_case({}, ctxWith([], null))).toMatchObject({ ok: false });
    expect(
      await CASE_HANDLERS.compare_case({ scene: 'Arm' }, ctxWith([{ tabId: 'tab-2', name: 'Rover copy' }])),
    ).toMatchObject({ ok: false, scenes: ['Rover copy'] });
  });
});

describe('explore_case', () => {
  const arm = servoArm();
  const made = buildCase(
    { goal: 'touch', world: 'floor', values: { dots: 3 } },
    builderRobot(buildRig(arm.joints, arm.parts), arm.parts),
  );
  const kase = made.ok ? made.kase : null!;
  const space = exploreSpace(arm.parts, { ...DEFAULT_PROJECT, joints: arm.joints })!;
  const weaker: Design = { variants: ['c046', 'c044', 'c044'], volts: space.current.volts };
  const runs = (passes: number, worstMargin: number): CaseRuns => ({
    runs: 8,
    passes,
    medianMargin: 0,
    worstMargin,
    commonFailure: null,
    failures: [],
    worstSeed: null,
    refusal: null,
    misfit: false,
  });
  const row = (design: Design, passes: number, costUsd: number) => ({
    key: designKey(design),
    design,
    changes: designChanges(space, design),
    runs: runs(passes, passes === 8 ? 0.10351 : -0.02),
    costUsd,
    massG: 1234.4,
  });
  const ctxWith = (explored: unknown, active: Case | null = kase) => ({
    cases: { cases: [kase], active } as unknown as Cases,
    routines: { checkLogic: async () => ({ ok: true }) as never },
    setAction: () => {},
    ...scene,
    caseRun: { enterCase: () => {} },
    caseCompare: { choicesFor: () => [], start: () => {}, compareNow: async () => null as never },
    caseExplore: { explore: async () => explored as never },
  });

  it('lists each design with its servos, passes, worst margin, cost and mass, the best first', async () => {
    const explored = { space, rows: [row(weaker, 1, 62), row(space.current, 8, 63.98)] };
    const reply = await CASE_HANDLERS.explore_case({}, ctxWith(explored));

    expect(reply).toMatchObject({
      ok: true,
      case: kase.name,
      runs: 8,
      current: {
        servos: [
          { joint: 'Shoulder', mpn: 'ST-3215-C001' },
          { joint: 'Elbow', mpn: 'ST-3215-C044' },
          { joint: 'Wrist', mpn: 'ST-3215-C044' },
        ],
      },
      designs: [
        { servos: 'current design', passes: 8, worst_margin: 0.104, cost_usd: 63.98, mass_g: 1234, current: true },
        {
          servos: 'Shoulder C046',
          passes: 1,
          worst_margin: -0.02,
          changes: [{ joints: ['Shoulder'], mpn: 'ST-3215-C046' }],
        },
      ],
    });
  });

  it('says why it can’t explore', async () => {
    expect(await CASE_HANDLERS.explore_case({}, ctxWith('No joint has a catalog servo.'))).toEqual({
      ok: false,
      problem: 'No joint has a catalog servo.',
    });
    expect(await CASE_HANDLERS.explore_case({}, ctxWith(null, null))).toMatchObject({ ok: false });
    expect(await CASE_HANDLERS.explore_case({ case: 'Nope' }, ctxWith(null))).toMatchObject({ ok: false });
  });
});
