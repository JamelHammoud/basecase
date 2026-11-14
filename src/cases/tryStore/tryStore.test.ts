import { describe, expect, it, vi } from 'vitest';
import type { Recording } from '../../sim/recorder';
import { storedTryOf, type StoredTry, type TrySummary } from '../tryFile';
import type { TryRecord } from '../tries';
import type { TryBackend } from './types';

const backend = vi.hoisted(() => ({ failList: true, saved: [] as string[], stored: [] as StoredTry[] }));

vi.mock('./desktopTries', () => ({
  desktopTries: {
    list: async () => {
      if (backend.failList) throw new Error('The tries folder didn’t open.');

      return backend.saved.map((id) => ({ id }) as TrySummary);
    },
    save: async (stored) => {
      backend.saved.push(stored.id);
      backend.stored.push(stored);
    },
    delete: async () => {},
  } as Partial<TryBackend>,
}));

const { deleteTries, keepTries, loadTries, onTriesChanged, saveManifest } = await import('./index');

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

describe('the search index’s view of the store', () => {
  const moving = (frames: number): Recording => {
    const poses = new Float32Array(frames * 7);

    for (let f = 0; f < frames; f++) poses[f * 7] = f / 100;

    return {
      dt: 0.02,
      frames,
      nq: 1,
      nv: 1,
      nu: 1,
      nbody: 1,
      t: new Float32Array(frames),
      ctrl: new Float32Array(frames),
      qpos: new Float64Array(frames),
      qvel: new Float32Array(frames).fill(0.5),
      poses,
    };
  };

  it('keeps each try’s motion and tells listeners what was kept and deleted', async () => {
    const heard: Array<{ kept: string[]; deleted: string[] }> = [];
    const stop = onTriesChanged(({ kept, deleted }) => heard.push({ kept: kept.map((k) => k.id), deleted }));

    await keepTries([{ ...kept('try-moved'), recording: moving(60) }]);

    const saved = backend.stored.find((s) => s.id === 'try-moved')!;

    expect(saved.motion).toMatchObject({ body: 'fixed', joints: 1 });
    expect(saved.motion!.path.slice(-3)).toEqual([0.59, 0, 0]);

    await saveManifest({ ...saved, tags: ['clean'] });
    await deleteTries(['try-moved']);
    stop();
    await deleteTries(['try-new']);

    expect(heard).toEqual([
      { kept: ['try-moved'], deleted: [] },
      { kept: ['try-moved'], deleted: [] },
      { kept: [], deleted: ['try-moved'] },
    ]);
  });
});
