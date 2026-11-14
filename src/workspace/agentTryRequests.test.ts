import { describe, expect, it, vi } from 'vitest';
import type { TryRecord } from '../cases/tries';
import type { TrySummary } from '../cases/tryFile';
import type { SimModel } from '../sim/mjcfTypes';
import type { ProjectSettings } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { TRY_HANDLERS, readTry, type TryReadContext } from './agentTryRequests';
import type { TryTimeline } from './useTryTimeline';

vi.mock('../cases/tryStore', async () => {
  const { storedTry } = await import('../cases/trySearch/fixtures/searchFixtures');
  const stored = [
    storedTry({ id: 'pick-1', robot: 'SO-101', verdict: 'failed', input: 'leader-arm' }),
    storedTry({ id: 'pick-2', robot: 'SO-101', verdict: 'passed', input: 'leader-arm' }),
    storedTry({ id: 'walk-1', robot: 'Hexapod', caseName: 'Walk', verdict: 'failed', seconds: 40 }),
  ];

  return {
    loadTries: async () => stored.map((t) => ({ id: t.id, stamp: 1, recording: false })),
    loadManifests: async (ids: string[]) => stored.filter((t) => ids.includes(t.id)),
    loadRecording: async () => null,
    loadSearchIndex: async () => null,
    saveSearchIndex: async () => {},
    updateManifests: async () => [],
    onTriesChanged: () => () => {},
  };
});

const record = (id: string, extra: Partial<TryRecord> = {}): TryRecord => ({
  id,
  caseId: 'walk',
  robot: 'Dog',
  at: `2026-11-1${id.length}T10:00:00Z`,
  passed: false,
  margin: -1,
  seconds: 5,
  manifest: {} as TryRecord['manifest'],
  ...extra,
});

function context(tries: TryRecord[], listed: TrySummary[] = [], simOn = false) {
  const timeline = { open: false, record: null, frame: 0, show: vi.fn(async () => false), close: vi.fn() };
  const ctx: TryReadContext = {
    project: () => ({ tries }) as unknown as ProjectSettings,
    viewport: () => null,
    setAction: () => {},
    cases: { cases: [] },
    tryRead: {
      timeline: () => timeline as unknown as TryTimeline,
      model: () => (simOn ? ({} as SimModel) : null),
      rig: () => ({}) as Rig,
      sought: () => null,
    },
    listTries: async () => listed,
  };

  return { ctx, timeline };
}

describe('read_try', () => {
  it('refuses a real try without opening the timeline', async () => {
    const { ctx, timeline } = context([record('t1', { real: true })]);

    expect(await readTry({ id: 't1' }, ctx)).toMatchObject({ ok: false, problem: expect.stringMatching(/real robot/) });
    expect(timeline.show).not.toHaveBeenCalled();
  });

  it('refuses while the simulation runs outside the timeline, leaving the sim and timeline alone', async () => {
    const { ctx, timeline } = context([record('t1')], [], true);

    expect(await readTry({ id: 't1' }, ctx)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/^The simulation is running/),
    });
    expect(timeline.show).not.toHaveBeenCalled();
    expect(timeline.close).not.toHaveBeenCalled();
  });

  it('lists this scene’s latest tries for an unknown id', async () => {
    const { ctx } = context([record('t1'), record('t22')]);
    const reply = (await readTry({ id: 'nope' }, ctx)) as { problem: string };

    expect(reply.problem).toMatch(/^No try nope\. This scene’s latest tries: t22 \(walk, failed/);
  });

  it('reads the latest try when none is named, and closes the timeline it opened when the recording won’t load', async () => {
    const { ctx, timeline } = context([record('t1'), record('t22')]);

    expect(await readTry({}, ctx)).toMatchObject({ ok: false, problem: expect.stringMatching(/^t22’s recording/) });
    expect(timeline.show).toHaveBeenCalledWith(expect.objectContaining({ id: 't22' }));
    expect(timeline.close).toHaveBeenCalled();
  });

  it('says when a scene has no tries', async () => {
    expect(await readTry({}, context([]).ctx)).toMatchObject({ ok: false, problem: expect.stringMatching(/no tries/) });
  });
});

describe('search_tries', () => {
  it('answers with each hit’s try and facts', async () => {
    const reply = await TRY_HANDLERS.search_tries({ query: 'failed grasp red block leader-arm' });

    expect(reply).toEqual({
      ok: true,
      count: 1,
      hits: [
        {
          try: 'pick-1',
          label: 'Grasp the Red Block',
          robot: 'SO-101',
          scene: 'scene-a',
          verdict: 'failed',
          seconds: 12,
          started: '2026-11-14T09:00:00.000Z',
          match: 'words',
        },
      ],
    });
  });

  it('caps the hits at the limit and refuses an empty query', async () => {
    const reply = (await TRY_HANDLERS.search_tries({ query: 'failed', limit: 1 })) as { count: number; hits: object[] };

    expect(reply.count).toBe(2);
    expect(reply.hits).toHaveLength(1);
    expect(await TRY_HANDLERS.search_tries({ query: '  ' })).toEqual({ ok: false, problem: expect.any(String) });
  });
});
