import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { CASE_HANDLERS } from './agentCaseRequests';
import { contextFor } from './agentCaseRequestFixtures';

const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

function create(payload: Record<string, unknown>) {
  const { ctx, added } = contextFor('rover-diff');
  const withJoints = { ...ctx, project: () => ({ joints: rover.joints }) as unknown as ProjectSettings };

  return { reply: CASE_HANDLERS.create_case({ goal: 'reach', ...payload }, withJoints), added };
}

describe('create_case faults', () => {
  it('keeps the list on the Case it adds', async () => {
    const faults = [
      { joint: 'left_wheel', kind: 'laggy' },
      { joint: 'right_wheel', kind: 'weak' },
    ];
    const { reply, added } = create({ faults });

    expect(await reply).toMatchObject({ ok: true });
    expect(added[0].faults).toEqual(faults);
  });

  it('adds a Case with no list when none is given', async () => {
    const { reply, added } = create({});

    expect(await reply).toMatchObject({ ok: true });
    expect(added[0]).not.toHaveProperty('faults');
  });

  it('refuses a fault on a joint the scene’s robot lacks, adding nothing', async () => {
    const { reply, added } = create({ faults: [{ joint: 'tail', kind: 'limp' }] });

    expect(await reply).toEqual({ ok: false, problem: 'tail isn’t a servo on this robot.' });
    expect(added).toEqual([]);
  });

  it('refuses a kind that isn’t one of the four, adding nothing', async () => {
    const { reply, added } = create({ faults: [{ joint: 'left_wheel', kind: 'melted' }] });

    expect(await reply).toMatchObject({ ok: false });
    expect(added).toEqual([]);
  });
});
