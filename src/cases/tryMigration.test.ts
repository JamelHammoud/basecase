import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { inStore, moveTries, type TryMove } from './tryMigration';
import type { StoredTry } from './tryFile';
import type { TryRecord } from './tries';

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

const recordingOf = (id: string) => ({ dt: 0.02, frames: id.length }) as unknown as Recording;

function fakeStore(legacyIds: string[]) {
  const legacy = new Map(legacyIds.map((id) => [id, recordingOf(id)]));
  const disk = new Map<string, { stored: StoredTry; recording: Recording | null }>();
  const move: TryMove = {
    get stored() {
      return new Set(disk.keys());
    },
    legacy: async (id) => legacy.get(id),
    dropLegacy: async (id) => legacy.delete(id),
    keep: async (kept) => kept.forEach((k) => disk.set(k.stored.id, k)),
  };

  return { legacy, disk, move };
}

const context = () => ({ sceneId: 'scene-a', caseName: 'Touch the Dots', joints: [] });

describe('moving a scene’s tries into the store', () => {
  it('moves each IndexedDB recording to the store once and keeps its id', async () => {
    const { legacy, disk, move } = fakeStore(['try-1', 'try-22']);
    const project = { tries: [record('try-1'), record('try-22')] };
    const before = JSON.stringify(project);

    expect(await moveTries(project.tries, context, move)).toEqual(['try-1', 'try-22']);
    expect([...disk.keys()]).toEqual(['try-1', 'try-22']);
    expect(disk.get('try-22')!.recording).toEqual(recordingOf('try-22'));
    expect(disk.get('try-1')!.stored).toMatchObject({
      id: 'try-1',
      sceneId: 'scene-a',
      case: { name: 'Touch the Dots' },
    });
    expect(legacy.size).toBe(0);
    expect(await moveTries(project.tries, context, move)).toEqual([]);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('keeps a try whose recording this browser never had, without one', async () => {
    const { disk, move } = fakeStore([]);

    await moveTries([record('try-lost')], context, move);
    expect(disk.get('try-lost')).toMatchObject({ stored: { id: 'try-lost' }, recording: null });
  });

  it('leaves the scene holding references only', async () => {
    const { disk, move } = fakeStore(['try-1']);
    const tries = [record('try-1')];

    await moveTries(tries, context, move);

    for (const t of tries) {
      expect(disk.has(t.id)).toBe(true);
      expect(Object.values(t).some((v) => ArrayBuffer.isView(v))).toBe(false);
      expect(JSON.stringify(t).length).toBeLessThan(400);
    }
  });

  it('shows only the scene’s tries still in the store once it moved', () => {
    const tries = [record('try-1'), record('try-2')];

    expect(inStore(tries, new Set(['try-2']), true).map((t) => t.id)).toEqual(['try-2']);
    expect(inStore(tries, new Set(['try-2']), false)).toEqual(tries);
    expect(inStore(tries, null, true)).toEqual(tries);
  });
});
