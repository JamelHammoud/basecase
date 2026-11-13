import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot, type CaseSpec } from '../cases/caseBuilder';
import { compileCaseLogic } from '../cases/caseLogic';
import type { Case } from '../cases/schema';
import type { Routine } from '../routines/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { CaseRuns } from '../cases/caseRuns';
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

  return { ctx: { cases, routines, caseCompare, setAction: () => {}, ...scene }, added };
}

const create = (payload: Record<string, unknown>, id = 'rover-diff') => {
  const { ctx, added } = contextFor(id);

  return { reply: CASE_HANDLERS.create_case(payload, ctx), added };
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
