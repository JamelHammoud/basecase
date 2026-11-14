import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashFrameSet, manifestOf, serializeFrame, serializeFrameSetManifest } from './frameSet';
import { visionFixture } from './fixtures';

const saved = vi.hoisted(() => ({
  frames: new Map<string, string>(),
  sets: new Map<string, { manifest: string; createdAt: string }>(),
  listed: [] as unknown[],
}));

vi.mock('./frameSetBackends', () => ({
  webFrameSets: {},
  desktopFrameSets: {
    list: async () => saved.listed,
    read: async (id: string) => saved.sets.get(id) ?? null,
    frame: async (id: string) => saved.frames.get(id) ?? null,
    saveFrame: async (id: string, data: string) => {
      saved.frames.set(id, data);
    },
    save: async (manifest: string) => {
      saved.sets.set(JSON.parse(manifest).id, { manifest, createdAt: '2026-11-14T00:00:00.000Z' });
    },
  },
}));

const { saveFrameSet, loadFrameSet, loadFrame, loadFrameSetManifest, listFrameSets } = await import('./frameSetStore');

beforeEach(() => {
  saved.frames.clear();
  saved.sets.clear();
  saved.listed = [];
});

describe('FrameSet persistence', () => {
  it('persists each frame separately and restores exact image, depth and labels', async () => {
    const set = visionFixture(3);

    await saveFrameSet(set);
    expect(saved.frames.size).toBe(3);
    expect(saved.sets.size).toBe(1);
    expect(await loadFrameSetManifest(set.id)).toEqual(manifestOf(set));
    expect(await loadFrameSet(set.id)).toEqual(set);
  });
  it('keeps full class names in the manifest without expanding list summaries', async () => {
    const set = visionFixture();

    set.classes = Array.from({ length: 256 }, (_, id) => ({ id, name: 'c'.repeat(2000), kind: 'box' }));
    set.id = hashFrameSet(set);
    await saveFrameSet(set);
    expect(saved.sets.get(set.id)?.manifest.length).toBeGreaterThan(65536);
    expect((await loadFrameSetManifest(set.id))?.classes).toEqual(set.classes);
  });
  it('returns null for missing or corrupt frames and manifests without exposing partial sets', async () => {
    const set = visionFixture(2);

    await saveFrameSet(set);
    saved.frames.delete(set.frames[1].id);
    expect(await loadFrameSet(set.id)).toBeNull();
    saved.frames.set(set.frames[0].id, serializeFrame({ ...set.frames[0], seed: 100 }));
    expect(await loadFrame(set.frames[0].id)).toBeNull();
    saved.sets.set(set.id, {
      manifest: serializeFrameSetManifest({ ...manifestOf(set), name: 'Changed' }),
      createdAt: '',
    });
    expect(await loadFrameSetManifest(set.id)).toBeNull();
    expect(await loadFrame('../auth')).toBeNull();
  });
  it('rejects content that differs from its hash before saving', async () => {
    await expect(saveFrameSet({ ...visionFixture(), name: 'Changed' })).rejects.toThrow();
    expect(saved.sets.size).toBe(0);
  });
  it('lists only bounded summaries and sorts newest first', async () => {
    const set = visionFixture();
    const summary = {
      id: set.id,
      name: set.name,
      caseId: set.caseId,
      frames: 1,
      classCount: set.classes.length,
      createdAt: '2026-11-14T00:00:00.000Z',
    };

    saved.listed = [
      { ...summary, classes: set.classes },
      { ...summary, id: '../auth' },
      { ...summary, frames: 10001 },
      { ...summary, classCount: -1 },
      { ...summary, classCount: 10001 },
    ];
    expect(await listFrameSets()).toEqual([summary]);
  });
});
