import { afterEach, describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { fixtureRobots } from '../sim/fixtures/robots';
import { decodeRecording, encodeRecording } from './recordingFile';
import {
  legacyRecords,
  recordOf,
  sceneTries,
  storedTry,
  withGenerated,
  type StoredTry,
  type TryRef,
} from './storedTry';
import { touchTheDots } from './testing';
import type { TryRecord } from './tries';
import type { TryBackend } from './tryBackend';
import { migratedRefs, migrateTries } from './tryMigration';
import { bridgeTries } from './tryBridge';
import { deleteTries, keepTry, listTries, onTriesDeleted, setTryBackend } from './tryStore';

const record = (id: string, extra: Partial<TryRecord> = {}): TryRecord => ({
  id,
  caseId: 'touch-the-dots',
  robot: 'Arm',
  at: '2026-11-13T10:00:00.000Z',
  passed: true,
  margin: 0.25,
  seconds: 2.4,
  manifest: {
    formatVersion: 1,
    caseHash: 'case-hash',
    modelHash: 'model-hash',
    seed: 0,
    frames: 120,
    dt: 1 / 50,
    faults: [{ joint: 'elbow', kind: 'stuck', at: 0.5, until: 1 }],
    commands: 3,
    world: 2,
  },
  ...extra,
});

const context = {
  sceneId: 'scene-a',
  caseName: 'Touch the Dots',
  contractHash: 'contract-hash',
  joints: [
    { id: 'elbow', name: 'Elbow', type: 'revolute' as const, drive: 'position' as const, actuator: 0, effort: 1.2 },
  ],
  input: 'script',
};

const recording = (frames = 3): Recording => ({
  dt: 1 / 50,
  frames,
  nq: 2,
  nv: 2,
  nu: 1,
  nbody: 1,
  t: Float32Array.from({ length: frames }, (_, i) => i / 50),
  ctrl: Float32Array.from({ length: frames }, (_, i) => i),
  qpos: Float64Array.from({ length: frames * 2 }, (_, i) => i * 0.1),
  qvel: new Float32Array(frames * 2),
  poses: new Float32Array(frames * 7),
  jointQpos: Int32Array.of(0, 1),
  root: [0, 1],
  faults: [],
  commands: [{ at: 0, command: { v: [1, 0, 0] } }],
  controller: { kind: 'hold', values: { elbow: 0.5 } },
});

const memoryBackend = (): TryBackend & { files: Map<string, StoredTry>; recordings: Map<string, Recording> } => {
  const files = new Map<string, StoredTry>();
  const recordings = new Map<string, Recording>();

  return {
    files,
    recordings,
    list: async () => [...files.values()],
    save: async ({ manifest, recording: r }) => {
      files.set(manifest.id, manifest);

      if (r) recordings.set(manifest.id, r);
    },
    recording: async (id) => recordings.get(id) ?? null,
    film: async () => null,
    remove: async (ids) => {
      ids.forEach((id) => {
        files.delete(id);
        recordings.delete(id);
      });
    },
  };
};

afterEach(() => setTryBackend(bridgeTries));

describe('stored tries', () => {
  it('round-trips a record through the try.json manifest', () => {
    for (const r of [record('a'), record('b', { real: true, passed: false }), record('c', { generated: true })]) {
      const stored = JSON.parse(JSON.stringify(storedTry(r, context))) as StoredTry;

      expect(recordOf(stored)).toEqual(r);
      expect(stored).toMatchObject({ id: r.id, sceneId: 'scene-a', rate: 50, input: 'script' });
      expect(stored.robot).toEqual({ name: 'Arm', modelHash: 'model-hash', joints: context.joints });
      expect(stored.case).toEqual({
        id: r.caseId,
        name: 'Touch the Dots',
        hash: 'case-hash',
        contractHash: 'contract-hash',
      });
    }

    expect(storedTry(record('d', { generated: true }), context).source).toBe('generated');
    expect(storedTry(record('e', { real: true, passed: false }), context).outcome).toEqual({
      result: 'failed',
      margin: 0.25,
    });
  });

  it('keeps a recording as binary typed arrays', () => {
    const original = recording(5);
    const bytes = encodeRecording(original);
    const back = decodeRecording(bytes.slice())!;

    expect(back).toEqual(original);
    expect(back.qpos).toBeInstanceOf(Float64Array);
    expect(back.jointQpos).toBeInstanceOf(Int32Array);
    expect(bytes.length).toBeLessThan(1024);
    expect(decodeRecording(new TextEncoder().encode('{"frames":3}'))).toBeNull();
  });

  it('moves IndexedDB recordings to the store once and keeps their ids', async () => {
    const legacy = new Map([
      ['try-1', recording()],
      ['try-2', recording(4)],
    ]);
    const backend = memoryBackend();
    const kase = touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!);
    const target = {
      sceneId: 'scene-a',
      cases: [kase],
      model: { hash: 'model-hash', joints: context.joints },
      legacy: {
        load: async (id: string) => legacy.get(id) ?? null,
        drop: async (id: string) => void legacy.delete(id),
      },
      keep: async (manifest: StoredTry, r?: Recording) => backend.save({ manifest, recording: r }),
    };
    let refs: TryRef[] = [record('try-1', { caseId: kase.id }), record('try-2', { caseId: kase.id })];

    const moved = await migrateTries(legacyRecords(refs), target);

    refs = migratedRefs(refs, moved);

    expect([...moved]).toEqual(['try-1', 'try-2']);
    expect(legacy.size).toBe(0);
    expect([...backend.recordings.keys()]).toEqual(['try-1', 'try-2']);
    expect(backend.files.get('try-1')).toMatchObject({ sceneId: 'scene-a', case: { name: kase.name } });
    expect(backend.files.get('try-1')!.robot.joints).toEqual(context.joints);
    expect(refs).toEqual([{ id: 'try-1' }, { id: 'try-2' }]);
    expect(await migrateTries(legacyRecords(refs), target)).toEqual(new Set());
    expect(sceneTries(refs, [...backend.files.values()]).map((t) => t.id)).toEqual(['try-1', 'try-2']);
  });

  it('keeps references only in the scene and reads records from the store', () => {
    const stored = [storedTry(record('a'), context), storedTry(record('b'), context)];
    const refs: TryRef[] = [{ id: 'b' }, { id: 'gone' }];

    expect(sceneTries(refs, stored).map((t) => t.id)).toEqual(['b']);
    expect(sceneTries(refs, stored)[0]).toBe(sceneTries(refs, stored)[0]);
    expect(sceneTries([record('old')], null).map((t) => t.id)).toEqual(['old']);
    expect(
      migratedRefs([record('old'), { id: 'b' }], new Set(['old'])).every((t) => Object.keys(t).join() === 'id'),
    ).toBe(true);
  });

  it('deletes a source try with its generated tries', async () => {
    const backend = memoryBackend();
    const source = record('src');
    const variation = (seed: number) =>
      record(`src-${seed}`, { generated: true, manifest: { ...source.manifest, seed, source: 'src' } });

    setTryBackend(backend);

    for (const r of [source, variation(1), variation(2), record('other')]) await keepTry(storedTry(r, context));

    const told: string[][] = [];
    const stop = onTriesDeleted((ids) => told.push([...ids]));

    expect(withGenerated(await listTries(), ['src'])).toEqual(['src', 'src-1', 'src-2']);
    expect(await deleteTries(['src'])).toEqual(['src', 'src-1', 'src-2']);
    expect([...backend.files.keys()]).toEqual(['other']);
    expect((await listTries()).map((t) => t.id)).toEqual(['other']);
    expect(told).toEqual([['src', 'src-1', 'src-2']]);

    setTryBackend({ ...backend, remove: () => Promise.reject(new Error('disk full')) });
    await expect(deleteTries(['other'])).rejects.toThrow('disk full');
    stop();
    expect(told).toHaveLength(1);
  });

  it('reads the store again after a failed list instead of keeping only the newest try', async () => {
    const backend = memoryBackend();
    let failures = 2;

    await backend.save({ manifest: storedTry(record('kept'), context) });
    setTryBackend({
      ...backend,
      list: () => (failures-- > 0 ? Promise.reject(new Error('offline')) : backend.list()),
    });
    expect(await listTries()).toEqual([]);
    await keepTry(storedTry(record('new'), context));
    expect((await listTries()).map((t) => t.id).sort()).toEqual(['kept', 'new']);
  });
});
