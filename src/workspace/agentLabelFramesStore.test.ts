import { beforeEach, describe, expect, it, vi } from 'vitest';
import { frameSetHash, type FrameSet } from '../vision/frameSet';
import { newDataset } from '../datasets/datasetFile';
import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import type { FrameBytes, FrameSetBackend, FrameSetManifest } from '../vision/frameSetStoreTypes';
import { LABEL_FRAME_HANDLERS } from './agentLabelFrames';
import { loadFrameSet, saveFrameSet } from '../vision/frameSetStore';
import { saveLabelEdits } from './frameLabelStorage';
import { addLabelClass, deleteLabel, labelGeometry, putLabel, renameLabelClass } from '../vision/labelEdits';

const stored = vi.hoisted(() => ({
  manifests: new Map<string, FrameSetManifest>(),
  frames: new Map<string, FrameBytes>(),
  frameReads: 0,
}));

vi.mock('../vision/desktopFrameSets', () => ({
  desktopFrameSets: {
    list: async () => [],
    manifest: async (id) => structuredClone(stored.manifests.get(id) ?? null),
    frame: async (id, frame) => {
      stored.frameReads++;

      return structuredClone(stored.frames.get(`${id}:${frame}`) ?? null);
    },
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
  stored.frameReads = 0;
  await saveFrameSet(fixture());
});

describe('label_frames concurrent edits', () => {
  it('keeps the editor history when saving without external changes', async () => {
    const previous = fixture();
    const first = labelGeometry({ width: 3, height: 2, instance: 'first', classId: 1, box: [0, 0, 1, 1] });
    const second = { ...first, instance: 'second' };
    const initial = putLabel(putLabel(previous, 'frame-1', first), 'frame-1', second);

    await saveFrameSet(initial);

    const next = putLabel(initial, 'frame-1', { ...first, review: 'suggested' });

    expect(await saveLabelEdits(initial, next)).toBe(next);
    expect(stored.frameReads).toBe(0);
  });

  it('merges stale local edits and undo with agent labels on the same frame', async () => {
    const previous = fixture();
    const manual = labelGeometry({ width: 3, height: 2, instance: 'manual', classId: 1, box: [1, 0, 2, 2] });
    const local = putLabel(renameLabelClass(previous, 1, 'Mug'), 'frame-1', manual);

    await LABEL_FRAME_HANDLERS.label_frames(
      { frame_set: 'set-1', labels: [{ frame: 'frame-1', annotations: [label] }] },
      ctx,
    );

    const merged = await saveLabelEdits(previous, local);

    expect(merged.classes[0].name).toBe('Mug');
    expect(merged.frames[0].annotations.map((annotation) => annotation.instance)).toEqual(['manual', 'cup']);

    const undone = await saveLabelEdits(local, previous);

    expect(undone.classes[0].name).toBe('Cup');
    expect(undone.frames[0].annotations.map((annotation) => annotation.instance)).toEqual(['cup']);
    expect(await loadFrameSet('set-1')).toEqual(undone);
  });

  it('keeps external classes while applying local deletion and gives local edits precedence', async () => {
    const previous = putLabel(
      fixture(),
      'frame-1',
      labelGeometry({ ...label, box: [0, 0, 2, 2], width: 3, height: 2 }),
    );
    const external = addLabelClass(previous, 'Bottle');
    const changed = { ...previous.frames[0].annotations[0], review: 'suggested' as const, source: 'agent' as const };

    await saveFrameSet(putLabel(external, 'frame-1', changed));

    const renamed = await saveLabelEdits(previous, renameLabelClass(previous, 1, 'Mug'));

    expect(renamed.classes.map((category) => category.name)).toEqual(['Mug', 'Bottle']);
    expect(renamed.frames[0].annotations[0]).toEqual(changed);

    const deleted = await saveLabelEdits(previous, deleteLabel(previous, 'frame-1', 'cup'));

    expect(deleted.frames[0].annotations).toEqual([]);
    expect(deleted.classes.map((category) => category.name)).toEqual(['Mug', 'Bottle']);
  });

  it('preserves edits to separate frames from concurrent agent calls', async () => {
    const initial = fixture();

    initial.frames.push({ ...initial.frames[0], id: 'frame-2' });
    await saveFrameSet(initial);

    const replies = await Promise.all(
      ['frame-1', 'frame-2'].map((frame) =>
        LABEL_FRAME_HANDLERS.label_frames({ frame_set: initial.id, labels: [{ frame, annotations: [label] }] }, ctx),
      ),
    );

    expect(replies.every((reply) => reply.ok)).toBe(true);
    expect((await loadFrameSet(initial.id))!.frames.map((frame) => frame.annotations)).toEqual([
      [expect.objectContaining({ instance: 'cup' })],
      [expect.objectContaining({ instance: 'cup' })],
    ]);
  });

  it('preserves new class keypoints when a stale local edit renames that class', async () => {
    const previous = fixture();

    await LABEL_FRAME_HANDLERS.label_frames(
      {
        frame_set: previous.id,
        classes: [{ ...previous.classes[0], keypoints: ['handle', 'rim'] }],
        labels: [
          { frame: 'frame-1', annotations: [{ ...label, keypoints: [{ name: 'rim', x: 1, y: 1, visible: true }] }] },
        ],
      },
      ctx,
    );

    const renamed = await saveLabelEdits(previous, renameLabelClass(previous, 1, 'Mug'));

    expect(renamed.classes[0]).toMatchObject({ name: 'Mug', keypoints: ['handle', 'rim'] });
    expect(renamed.frames[0].annotations[0].keypoints[0].name).toBe('rim');
  });
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
