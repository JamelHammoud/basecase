import { describe, expect, it, vi } from 'vitest';

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
    saveManifest: async () => {},
    onTriesChanged: () => () => {},
  };
});

const { TRY_HANDLERS } = await import('./agentTryRequests');

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
