import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameSet } from './frameSet';
import type { FrameBytes, FrameSetBackend, FrameSetManifest } from './frameSetStoreTypes';
import { manifestOf } from './frameSetStoreTypes';
import { frameSetHash } from './frameSet';

const stored = vi.hoisted(() => ({
  manifests: new Map<string, FrameSetManifest>(),
  frames: new Map<string, FrameBytes>(),
  reads: [] as string[],
  writes: [] as string[],
  onRead: null as (() => void) | null,
}));

vi.mock('./desktopFrameSets', () => ({
  desktopFrameSets: {
    list: async () =>
      [...stored.manifests.values()].map((manifest) => ({ ...manifest, frames: manifest.frames.length })),
    manifest: async (id) => stored.manifests.get(id) ?? null,
    frame: async (id, frameId) => {
      stored.reads.push(frameId);
      stored.onRead?.();

      return structuredClone(stored.frames.get(`${id}:${frameId}`) ?? null);
    },
    jpeg: async (id, frameId) => stored.frames.get(`${id}:${frameId}`)?.jpeg ?? null,
    saveFrame: async (id, frameId, bytes) => {
      stored.writes.push(frameId);
      stored.frames.set(`${id}:${frameId}`, structuredClone(bytes));
    },
    saveManifest: async (manifest, sourceId) => {
      for (const frame of manifest.frames) {
        const bytes = stored.frames.get(`${sourceId ?? manifest.id}:${frame.id}`);

        if (!bytes) throw new Error('Missing image');

        stored.frames.set(`${manifest.id}:${frame.id}`, bytes);
      }

      stored.manifests.set(manifest.id, manifest);
    },
  } satisfies FrameSetBackend,
}));

const {
  saveFrameSet,
  saveFrameSetMetadata,
  loadFrameSet,
  loadTrainingFrame,
  saveTrainingFrame,
  finalizeFrameSet,
  listFrameSets,
} = await import('./frameSetStore');
const fixture = (): FrameSet => ({
  version: 1,
  id: 'set-1',
  name: 'Blocks',
  caseId: null,
  sceneId: null,
  seed: 42,
  classes: [],
  createdAt: 'now',
  frames: [1, 2].map((i) => ({
    id: `f${i}`,
    seed: i,
    camera: 'camera',
    width: 1,
    height: 1,
    annotations: [],
    jpeg: new Uint8Array([255, 216, 255, 217]),
    depth: new Float32Array([i + 0.125]),
  })),
});

beforeEach(() => {
  stored.manifests.clear();
  stored.frames.clear();
  stored.reads.length = 0;
  stored.writes.length = 0;
  stored.onRead = null;
});

describe('the frame set library', () => {
  it('loads canonical image sets with assignments for every stored frame', async () => {
    const set = { ...fixture(), splits: { f1: 'train' as const, f2: 'validation' as const } };

    await saveFrameSet(set);
    expect(await loadTrainingFrame(set.id, 'f2')).toEqual(set.frames[1]);
    expect(await loadFrameSet(set.id)).toEqual(set);
  });

  it('keeps blobs out of the list and loads only the requested frame', async () => {
    const set = fixture();

    await saveFrameSet(set);
    expect(await listFrameSets()).toEqual([{ ...set, frames: 2 }]);
    expect(stored.reads).toEqual([]);
    expect(stored.manifests.get(set.id)?.frames[0]).not.toHaveProperty('jpeg');
    expect(stored.manifests.get(set.id)?.frames[0]).not.toHaveProperty('depth');
    expect(await loadTrainingFrame(set.id, 'f2')).toEqual(set.frames[1]);
    expect(stored.reads).toEqual(['f2']);
    expect(await loadFrameSet(set.id)).toEqual(set);
  });

  it('finalizes streamed frames with a manifest after the bytes are saved', async () => {
    const set = { ...fixture(), id: 'set-final' };

    for (const frame of set.frames) await saveTrainingFrame('staged', frame, set.classes);

    expect(await loadFrameSet('staged')).toBeNull();

    await finalizeFrameSet(
      { ...set, frames: set.frames.map(({ jpeg: _jpeg, depth: _depth, ...frame }) => frame) },
      'staged',
    );

    expect(await loadFrameSet('set-final')).toEqual(set);
    await expect(loadFrameSet('../auth')).rejects.toThrow('image id');
    await expect(saveTrainingFrame('../auth', set.frames[0], [])).rejects.toThrow('image id');
    await expect(
      saveFrameSet({ ...set, frames: [{ ...set.frames[0], depth: new Float32Array([NaN]) }] }),
    ).rejects.toThrow('format');
  });

  it('skips corrupted manifest headers before loading any blobs', async () => {
    stored.manifests.set('bad', { ...fixture(), id: 'bad', seed: -1 });

    const before = stored.reads.length;

    expect(await loadFrameSet('bad')).toBeNull();
    expect((await listFrameSets()).some((set) => set.id === 'bad')).toBe(false);
    expect(stored.reads).toHaveLength(before);
  });

  it.each([{ f1: 'train' }, { f1: 'train', f2: 'other' }, { f1: 'train', f2: 'test', extra: 'train' }])(
    'rejects a damaged split map before loading image bytes: %j',
    async (splits) => {
      const set = fixture();

      await saveFrameSet(set);
      stored.manifests.set(set.id, { ...stored.manifests.get(set.id)!, splits } as FrameSetManifest);
      expect(await loadFrameSet(set.id)).toBeNull();
      expect(stored.reads).toEqual([]);
    },
  );

  it.each([
    { width: 8193 },
    { width: 8192, height: 8192 },
    { annotations: null },
    { jpeg: [255, 216, 255, 217] },
    { depth: [1] },
  ])('rejects corrupt stored frame metadata before reading blobs: %j', async (changes) => {
    const set = fixture();

    await saveFrameSet(set);

    const manifest = stored.manifests.get(set.id)!;
    const before = stored.reads.length;

    stored.manifests.set(set.id, {
      ...manifest,
      frames: [{ ...manifest.frames[0], ...changes }] as FrameSetManifest['frames'],
    });

    expect(await loadFrameSet(set.id)).toBeNull();
    expect(stored.reads).toHaveLength(before);
  });
});

describe('metadata-only image writes', () => {
  it('keeps metadata writes scoped to their original set even when frame ids repeat', async () => {
    const original = fixture();
    const other = { ...fixture(), id: 'other-set' };

    await saveFrameSet(original);
    await saveFrameSet(other);
    stored.writes.length = 0;

    await expect(
      saveFrameSetMetadata(manifestOf({ ...original, conditions: ['night'] }), manifestOf(other)),
    ).rejects.toThrow('changed');
    expect(stored.manifests.get(original.id)?.conditions).toBeUndefined();
    expect(stored.manifests.get(other.id)?.conditions).toBeUndefined();
    expect(stored.writes).toEqual([]);
  });
  it('streams verified frame hashes without rewriting image blobs and preserves the canonical hash', async () => {
    const original = fixture();

    await saveFrameSet(original);
    stored.writes.length = 0;

    const next = {
      ...original,
      conditions: ['night'],
      frames: original.frames.map((frame) => ({ ...frame, conditions: ['night'] })),
    };
    const hash = await saveFrameSetMetadata(manifestOf(next), manifestOf(original));

    expect(hash).toBe(await frameSetHash(next));
    expect(stored.writes).toEqual([]);
    expect(stored.reads).toEqual(['f1', 'f2']);
    expect(await loadFrameSet(next.id)).toEqual(next);
  });

  it.each(['before', 'during'])('refuses a source changed %s metadata hashing without overwriting it', async (when) => {
    const original = fixture();

    await saveFrameSet(original);
    stored.writes.length = 0;

    const changed = () => stored.manifests.set(original.id, { ...manifestOf(original), name: 'Changed source' });

    if (when === 'before') changed();
    else stored.onRead = changed;

    const next = { ...original, conditions: ['night'] };

    await expect(saveFrameSetMetadata(manifestOf(next), manifestOf(original))).rejects.toThrow('changed');
    expect(stored.manifests.get(original.id)?.name).toBe('Changed source');
    expect(stored.manifests.get(original.id)?.conditions).toBeUndefined();
    expect(stored.writes).toEqual([]);
  });
});
