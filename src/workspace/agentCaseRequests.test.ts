import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot, type CaseSpec } from '../cases/caseBuilder';
import { compileCaseLogic } from '../cases/caseLogic';
import type { Case } from '../cases/schema';
import type { Routine } from '../routines/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { CASE_HANDLERS, caseValues } from './agentCaseRequests';
import type { Cases } from './useCases';

function contextFor(id: string) {
  const r = fixtureRobots().find((f) => f.id === id)!;
  const robot = builderRobot(buildRig(r.joints, r.parts), r.parts);
  const added: Case[] = [];
  const running: string[] = [];
  const cases = {
    cases: added,
    fitOf: async (kase: Case) => [{ id: 'slot', label: 'Fits this Case', state: 'pass', detail: kase.name }],
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

  const ctx = { cases, routines, setAction: () => {}, runCase: (caseId: string) => running.push(caseId) };

  return { ctx, added, running };
}

const create = (payload: Record<string, unknown>, id = 'rover-diff') => {
  const { ctx, added, running } = contextFor(id);

  return { reply: CASE_HANDLERS.create_case(payload, ctx), added, running, ctx };
};

const cameraConsole = (panels: unknown[] = [{ id: 'eye', kind: 'camera', signal: 'camera.*' }]) => ({
  input: ['keys'],
  panels: [...panels, { id: 'tries', kind: 'list', of: 'tries' }],
  layout: { areas: [{ canvas: true }, { size: 360, panels: ['eye', 'tries'] }] },
});

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

  it('builds a Case app from a console and opens it in Run Case', async () => {
    const { reply, added, running } = create({ goal: 'touch', console: cameraConsole() }, 'arm-3dof');

    expect(await reply).toMatchObject({ ok: true, id: 'touch-a-point', running: true });
    expect(added[0].console?.panels.map((p) => p.kind)).toEqual(['camera', 'list']);
    expect(running).toEqual(['touch-a-point']);
  });

  it('opens nothing without a console', async () => {
    const { reply, running } = create({ goal: 'reach' });

    expect(await reply).not.toHaveProperty('running');
    expect(running).toEqual([]);
  });

  it('refuses a console panel or input parseCase refuses, by its path, and adds and opens nothing', async () => {
    const radar = create({ goal: 'touch', console: cameraConsole([{ id: 'eye', kind: 'radar' }]) }, 'arm-3dof');

    expect(await radar.reply).toEqual({
      ok: false,
      problem: expect.stringMatching(/^console.panels\[0\].kind must be/),
    });
    expect(radar.added).toEqual([]);
    expect(radar.running).toEqual([]);

    const midi = create({ goal: 'touch', console: { ...cameraConsole(), input: ['midi'] } }, 'arm-3dof');

    expect(await midi.reply).toEqual({
      ok: false,
      problem: 'console.input[0] midi can’t drive a Case in this version',
    });
    expect(midi.running).toEqual([]);
  });

  it('checks a Case’s fit by id, and names the Cases there are for an unknown one', async () => {
    const { reply, ctx } = create({ goal: 'reach' });

    await reply;

    expect(await CASE_HANDLERS.check_case_fit({ id: 'reach-a-spot' }, ctx)).toEqual({
      ok: true,
      rows: [{ id: 'slot', label: 'Fits this Case', state: 'pass', detail: 'Reach a Spot' }],
    });
    expect(await CASE_HANDLERS.check_case_fit({ id: 'nope' }, ctx)).toEqual({
      ok: false,
      problem: 'No Case nope. Cases: reach-a-spot',
    });
  });
});
