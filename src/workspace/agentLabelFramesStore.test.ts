import { beforeEach, describe, expect, it, vi } from 'vitest';
import { frameSetHash, type FrameSet } from '../vision/frameSet';
import { newDataset } from '../datasets/datasetFile';
import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import type { FrameBytes, FrameSetBackend, FrameSetManifest } from '../vision/frameSetStoreTypes';
import { LABEL_FRAME_HANDLERS } from './agentLabelFrames';
import { loadFrameSet, saveFrameSet } from '../vision/frameSetStore';

const stored = vi.hoisted(() => ({
  manifests: new Map<string, FrameSetManifest>(),
  frames: new Map<string, FrameBytes>(),
}));

vi.mock('../vision/desktopFrameSets', () => ({
  desktopFrameSets: {
    list: async () => [],
    manifest: async (id) => structuredClone(stored.manifests.get(id) ?? null),
    frame: async (id, frame) => structuredClone(stored.frames.get(`${id}:${frame}`) ?? null),
    jpeg: async (id, frame) => stored.frames.get(`${id}:${frame}`)?.jpeg ?? null,
    saveFrame: async (id, frame, bytes) => {
      stored.frames.set(`${id}:${frame}`, structuredClone(bytes));
    },
    saveManifest: async (manifest) => {
      stored.manifests.set(manifest.id, structuredClone(manifest));
    },
  } satisfies FrameSetBackend,
}));

vi.mock('../datasets/datasetStore', () => ({ loadDatasets: vi.fn(async () => []), saveDataset: vi.fn() }));

const fixture = (): FrameSet => ({
  version: 1,
  id: 'set-1',
  name: 'Cup',
  caseId: null,
  sceneId: null,
  seed: 1,
  createdAt: 'now',
  classes: [{ id: 1, name: 'Cup', keypoints: ['handle'] }],
  frames: [
    {
      id: 'frame-1',
      seed: 1,
      camera: 'wrist',
      width: 3,
      height: 2,
      jpeg: new Uint8Array([255, 216, 255, 217]),
      depth: new Float32Array(6),
      annotations: [],
    },
  ],
});
const ctx = { setAction: () => {} };
const label = {
  instance: 'cup',
  classId: 1,
  box: [0, 0, 2, 2],
  keypoints: [{ name: 'handle', x: 1, y: 1, visible: true }],
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(loadDatasets).mockResolvedValue([]);
  stored.manifests.clear();
  stored.frames.clear();
  await saveFrameSet(fixture());
});

describe('label_frames stored pipeline', () => {
  it('persists suggestions, reopens exact geometry and returns only image-free metadata in text', async () => {
    expect(
      await LABEL_FRAME_HANDLERS.label_frames(
        { frame_set: 'set-1', labels: [{ frame: 'frame-1', annotations: [label] }] },
        ctx,
      ),
    ).toMatchObject({ ok: true });

    const saved = await loadFrameSet('set-1');
    const annotation = saved!.frames[0].annotations[0];

    expect(annotation).toMatchObject({ ...label, source: 'agent', review: 'suggested' });
    expect(annotation.mask).toEqual({ size: [2, 3], counts: [0, 4, 2] });

    const read = await LABEL_FRAME_HANDLERS.label_frames({ frame_set: 'set-1' }, ctx);
    const metadata = JSON.parse(read.text ?? '{}');

    expect(metadata.frame_ids).toEqual(['frame-1']);
    expect(metadata.frames[0]).not.toHaveProperty('jpeg');
    expect(metadata.frames[0]).not.toHaveProperty('depth');
    expect(metadata.frames[0].annotations[0]).not.toHaveProperty('mask');
    expect(read.images).toHaveLength(1);
  });

  it('updates working dataset hashes and preserves frame subsets and saved versions', async () => {
    const member = { frameSetId: 'set-1', frameIds: ['frame-1'], hash: await frameSetHash(fixture()) };
    const dataset = newDataset({
      id: 'dataset-1',
      name: 'Cup',
      task: 'Pick up cup',
      members: [],
      imageMembers: [member],
      at: 'now',
    });
    const version = { n: 1, hash: 'a'.repeat(64), at: 'now', members: [], imageMembers: [member] };

    dataset.versions = [version];
    vi.mocked(loadDatasets).mockResolvedValue([dataset]);
    expect(
      await LABEL_FRAME_HANDLERS.label_frames(
        { frame_set: 'set-1', labels: [{ frame: 'frame-1', annotations: [label] }] },
        ctx,
      ),
    ).toMatchObject({ ok: true });

    const changed = vi.mocked(saveDataset).mock.calls[0][0];
    const saved = await loadFrameSet('set-1');

    expect(changed.imageMembers).toEqual([{ ...member, hash: await frameSetHash(saved!), classes: ['Cup'] }]);
    expect(changed.versions).toEqual([version]);
  });

  it('accepts an exact saved annotation and forces human review again', async () => {
    await LABEL_FRAME_HANDLERS.label_frames(
      { frame_set: 'set-1', labels: [{ frame: 'frame-1', annotations: [label] }] },
      ctx,
    );

    const annotation = (await loadFrameSet('set-1'))!.frames[0].annotations[0];
    const exact = { ...annotation, source: 'manual', review: 'accepted' };

    expect(
      await LABEL_FRAME_HANDLERS.label_frames(
        { frame_set: 'set-1', labels: [{ frame: 'frame-1', annotations: [exact] }] },
        ctx,
      ),
    ).toMatchObject({ ok: true });
    expect((await loadFrameSet('set-1'))!.frames[0].annotations[0]).toEqual(annotation);
  });

  it('refuses malformed masks and unknown keypoints before changing stored labels', async () => {
    const damaged = { ...label, mask: { size: [2, 3], counts: [0, 6] }, polygons: [] };
    const unknownPoint = { ...label, keypoints: [{ name: 'rim', x: 1, y: 1, visible: true }] };

    for (const annotation of [damaged, unknownPoint]) {
      expect(
        await LABEL_FRAME_HANDLERS.label_frames(
          { frame_set: 'set-1', labels: [{ frame: 'frame-1', annotations: [annotation] }] },
          ctx,
        ),
      ).toMatchObject({ ok: false });
      expect(await loadFrameSet('set-1')).toEqual(fixture());
    }
  });
});
