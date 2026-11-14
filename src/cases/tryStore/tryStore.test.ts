import { describe, expect, it, vi } from 'vitest';
import { storedTryOf, type TrySummary } from '../tryFile';
import type { TryRecord } from '../tries';
import type { TryBackend } from './types';

const backend = vi.hoisted(() => ({ failList: true, saved: [] as string[] }));

vi.mock('./desktopTries', () => ({
  desktopTries: {
    list: async () => {
      if (backend.failList) throw new Error('The tries folder didn’t open.');

      return backend.saved.map((id) => ({ id }) as TrySummary);
    },
    save: async (stored) => {
      backend.saved.push(stored.id);
    },
    delete: async () => {},
  } as Partial<TryBackend>,
}));

const { keepTries, loadTries } = await import('./index');

const record = (id: string): TryRecord => ({
  id,
  caseId: 'touch-the-dots',
  robot: 'Arm',
  at: '2026-11-13T10:00:00.000Z',
  passed: true,
  margin: 0.1,
  seconds: 2,
  manifest: { formatVersion: 1, caseHash: 'c', modelHash: 'm', seed: 0, frames: 100, dt: 0.02 },
});

const kept = (id: string) => ({
  stored: storedTryOf(record(id), { sceneId: 'scene-a', caseName: 'Touch the Dots', joints: [] }),
  recording: null,
});

describe('the tries list when the store fails to list', () => {
  it('never publishes only the tries saved since, and lists again once the store answers', async () => {
    backend.saved.push('try-old');

    await expect(loadTries()).resolves.toEqual([]);

    await keepTries([kept('try-new')]);

    backend.failList = false;

    const listed = await loadTries();

    expect(listed.map((t) => t.id)).toEqual(['try-old', 'try-new']);
  });
});
