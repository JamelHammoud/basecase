import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { fromLegacy, isLegacyTry, migrateTries, type LegacyTry } from './tryMigration';
import { generatedTry, withGenerated, type TryRecord } from './tries';

const legacy = (id: string, extra: Partial<LegacyTry> = {}): LegacyTry => ({
  id,
  caseId: 'touch',
  robot: 'Arm',
  at: '2026-11-01T10:00:00.000Z',
  passed: true,
  margin: 0.25,
  seconds: 4,
  manifest: { caseHash: 'c'.repeat(64), modelHash: 'm'.repeat(64), seed: 0, frames: 200, dt: 0.02, commands: 3 },
  ...extra,
});

const scene = { sceneId: 'scene-1', cases: [], model: null, modelHash: null };

const recordingOf = (id: string) => ({ frames: 200, dt: 0.02, id }) as unknown as Recording;

function stores(ids: string[]) {
  const legacyDb = new Map(ids.map((id) => [id, recordingOf(id)]));
  const saved = new Map<string, { record: TryRecord; recording: Recording | null }>();

  return {
    legacyDb,
    saved,
    stores: {
      legacy: {
        load: async (id: string) => legacyDb.get(id) ?? null,
        remove: async (id: string) => legacyDb.delete(id),
      },
      has: (id: string) => saved.has(id),
      save: async (record: TryRecord, recording: Recording | null) => {
        saved.set(record.id, { record, recording: recording ?? saved.get(record.id)?.recording ?? null });
      },
    },
  };
}

describe('moving tries out of IndexedDB', () => {
  it('moves each recording once, keeps its id, and leaves the scene with references only', async () => {
    const entries = [
      legacy('try-a'),
      legacy('try-a-3', { generated: true, manifest: { ...legacy('x').manifest, seed: 3, source: 'try-a' } }),
    ];
    const world = stores(['try-a', 'try-a-3']);
    const refs = await migrateTries(entries, scene, world.stores);

    expect(refs).toEqual([{ id: 'try-a' }, { id: 'try-a-3' }]);
    expect(refs.some(isLegacyTry)).toBe(false);
    expect([...world.saved.keys()]).toEqual(['try-a', 'try-a-3']);
    expect(world.saved.get('try-a')?.recording).toEqual(recordingOf('try-a'));
    expect(world.legacyDb.size).toBe(0);
    expect(world.saved.get('try-a-3')?.record).toMatchObject({ source: 'generated', seed: 3, sourceTry: 'try-a' });

    const again = await migrateTries(refs, scene, world.stores);

    expect(again).toEqual(refs);
    expect(world.saved.get('try-a')?.recording).toEqual(recordingOf('try-a'));
  });

  it('keeps a record whose recording is gone, and never overwrites a try already moved', async () => {
    const world = stores([]);

    await migrateTries([legacy('try-b')], scene, world.stores);
    expect(world.saved.get('try-b')).toMatchObject({ recording: null, record: { id: 'try-b' } });

    world.saved.set('try-b', { record: { ...world.saved.get('try-b')!.record, seconds: 9 }, recording: null });
    await migrateTries([legacy('try-b')], scene, world.stores);
    expect(world.saved.get('try-b')?.record.seconds).toBe(9);
  });

  it('turns the old record into the manifest', () => {
    const record = fromLegacy(legacy('try-c', { passed: false, margin: -0.1 }), {
      ...scene,
      cases: [{ id: 'touch', name: 'Touch the Dots' }] as never,
    });

    expect(record).toMatchObject({
      version: 1,
      id: 'try-c',
      sceneId: 'scene-1',
      robot: { name: 'Arm', modelHash: 'm'.repeat(64) },
      case: { id: 'touch', name: 'Touch the Dots', hash: 'c'.repeat(64) },
      source: 'case',
      rate: 50,
      outcome: { result: 'failed', margin: -0.1 },
      sourceTry: null,
      commands: 3,
    });
    expect(fromLegacy(legacy('try-r', { real: true }), scene).source).toBe('real');
  });
});

describe('deleting a try', () => {
  it('takes its generated tries with it', () => {
    const source = fromLegacy(legacy('try-d'), scene);
    const recording = recordingOf('x');
    const made = [1, 2].map((seed) => generatedTry({ source, seed, margin: 0.1, recording }));
    const other = fromLegacy(legacy('try-e'), scene);

    expect([...withGenerated([source, ...made, other], ['try-d'])]).toEqual(['try-d', 'try-d-1', 'try-d-2']);
  });
});
