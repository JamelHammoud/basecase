import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot, type CaseSpec } from '../cases/caseBuilder';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { CASE_HANDLERS, caseValues } from './agentCaseRequests';
import type { Cases } from './useCases';

function contextFor(id: string) {
  const r = fixtureRobots().find((f) => f.id === id)!;
  const robot = builderRobot(buildRig(r.joints, r.parts), r.parts);
  const added: CaseSpec[] = [];
  const cases = {
    builder: {
      add: (spec: CaseSpec) => {
        added.push(spec);

        return buildCase(spec, robot);
      },
    },
  } as unknown as Cases;

  return { ctx: { cases, setAction: () => {} }, added };
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
    expect(added[0].objects?.[0]).toMatchObject({ name: 'Ramp', position: [0, 20, 500], size: [300, 40, 200] });
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
});
