import { beforeEach, describe, expect, it, vi } from 'vitest';
import { frameSetHash, type FrameSet } from '../vision/frameSet';
import { LABEL_FRAME_HANDLERS } from './agentLabelFrames';
import { requestHandler } from './agentRequestHandlers';
import { loadFrameJpeg, loadFrameSet, loadFrameSetManifest, saveFrameSet } from '../vision/frameSetStore';

vi.mock('../vision/frameSetStore', () => ({
  loadFrameSetManifest: vi.fn(),
  loadFrameSet: vi.fn(),
  loadFrameJpeg: vi.fn(),
  saveFrameSet: vi.fn(),
  hashFrameSet: (set: FrameSet) => frameSetHash(set),
}));

vi.mock('../datasets/datasetStore', () => ({ loadDatasets: async () => [], saveDataset: vi.fn() }));

const fixture = (): FrameSet => ({
  version: 1,
  id: 'frames-1',
  name: 'Kitchen',
  caseId: null,
  sceneId: null,
  seed: 0,
  createdAt: '2026-11-15',
  classes: [{ id: 1, name: 'Cup', keypoints: ['handle'] }],
  frames: ['frame-1', 'frame-2'].map((id) => ({
    id,
    seed: 0,
    camera: 'wrist',
    width: 4,
    height: 3,
    jpeg: new Uint8Array([255, 216, 255, 217]),
    depth: new Float32Array(12),
    annotations: [],
  })),
});
const ctx = { setAction: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadFrameSetManifest).mockResolvedValue(fixture());
  vi.mocked(loadFrameSet).mockResolvedValue(fixture());
  vi.mocked(loadFrameJpeg).mockResolvedValue(new Uint8Array([255, 216, 255, 217]));
});

describe('label_frames', () => {
  it('is registered for workspace dispatch', () => {
    expect(requestHandler('label_frames')).toBe(LABEL_FRAME_HANDLERS.label_frames);
  });

  it('returns requested stored frames, dimensions, classes and visible images', async () => {
    const reply = await LABEL_FRAME_HANDLERS.label_frames({ frame_set: 'frames-1', frames: ['frame-2'] }, ctx);

    expect(reply).toMatchObject({ ok: true, frame_set: 'frames-1', frames: [{ id: 'frame-2', width: 4, height: 3 }] });
    expect(reply.images).toEqual([{ view: 'frame-2 (4 × 3)', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }]);
    expect(JSON.parse(reply.text ?? '{}').classes).toEqual(fixture().classes);
    expect(saveFrameSet).not.toHaveBeenCalled();
  });

  it('canonicalizes boxes and saves suggestions through the existing frame-set store', async () => {
    const reply = await LABEL_FRAME_HANDLERS.label_frames(
      {
        frame_set: 'frames-1',
        labels: [{ frame: 'frame-1', annotations: [{ instance: 'cup', classId: 1, box: [1, 0, 2, 2] }] }],
      },
      ctx,
    );

    expect(reply).toMatchObject({ ok: true, updated: 1 });
    expect(saveFrameSet).toHaveBeenCalledOnce();

    const saved = vi.mocked(saveFrameSet).mock.calls[0][0];

    expect(saved.frames[0].annotations[0]).toMatchObject({
      instance: 'cup',
      classId: 1,
      box: [1, 0, 2, 2],
      source: 'agent',
      review: 'suggested',
    });
    expect(saved.frames[1]).toEqual(fixture().frames[1]);
    expect(saved.id).toBe('frames-1');
  });

  it('renames classes without changing their identity', async () => {
    await LABEL_FRAME_HANDLERS.label_frames(
      { frame_set: 'frames-1', classes: [{ id: 1, name: 'Mug', keypoints: ['handle'] }] },
      ctx,
    );
    expect(vi.mocked(saveFrameSet).mock.calls[0][0].classes[0]).toMatchObject({ id: 1, name: 'Mug' });
  });

  it.each([
    { frame_set: '../frames' },
    { frame_set: 'CON' },
    { frame_set: 'frames-1', frames: [] },
    { frame_set: 'frames-1', frames: ['missing'] },
    { frame_set: 'frames-1', frames: ['frame-1', 'frame-1'] },
    { frame_set: 'frames-1', labels: [] },
    { frame_set: 'frames-1', labels: [{ frame: 'missing', annotations: [] }] },
    {
      frame_set: 'frames-1',
      labels: [{ frame: 'frame-1', annotations: [{ instance: 'cup', classId: 99, box: [0, 0, 1, 1] }] }],
    },
    {
      frame_set: 'frames-1',
      labels: [{ frame: 'frame-1', annotations: [{ instance: 'cup', classId: 1, box: [0, 0, -1, 1] }] }],
    },
    {
      frame_set: 'frames-1',
      classes: [
        { id: 1, name: 'Cup' },
        { id: 2, name: 'Cup' },
      ],
    },
  ])('refuses malformed input without saving: %j', async (payload) => {
    expect(await LABEL_FRAME_HANDLERS.label_frames(payload, ctx)).toMatchObject({
      ok: false,
      problem: expect.any(String),
    });
    expect(saveFrameSet).not.toHaveBeenCalled();
  });

  it('refuses unsafe storage ids before reading the library', async () => {
    for (const frame_set of ['../auth', 'CON', 'set/../../auth']) {
      expect(await LABEL_FRAME_HANDLERS.label_frames({ frame_set }, ctx)).toMatchObject({ ok: false });
    }

    expect(loadFrameSetManifest).not.toHaveBeenCalled();
    expect(loadFrameSet).not.toHaveBeenCalled();
    expect(loadFrameJpeg).not.toHaveBeenCalled();
  });

  it('refuses oversized label submissions before reading the library', async () => {
    expect(
      await LABEL_FRAME_HANDLERS.label_frames({ frame_set: 'frames-1', extra: 'x'.repeat(16 * 1024 * 1024) }, ctx),
    ).toMatchObject({ ok: false });
    expect(loadFrameSetManifest).not.toHaveBeenCalled();
    expect(saveFrameSet).not.toHaveBeenCalled();
  });

  it('refuses oversized image replies', async () => {
    vi.mocked(loadFrameJpeg).mockResolvedValue(new Uint8Array(16 * 1024 * 1024 + 1));
    expect(await LABEL_FRAME_HANDLERS.label_frames({ frame_set: 'frames-1', frames: ['frame-1'] }, ctx)).toMatchObject({
      ok: false,
    });
  });

  it('checks an explicit read selection before saving labels', async () => {
    expect(
      await LABEL_FRAME_HANDLERS.label_frames(
        { frame_set: 'frames-1', frames: ['missing'], classes: [{ id: 1, name: 'Mug' }] },
        ctx,
      ),
    ).toMatchObject({ ok: false });
    expect(saveFrameSet).not.toHaveBeenCalled();
  });

  it('refuses a missing stored frame image', async () => {
    vi.mocked(loadFrameJpeg).mockResolvedValue(null);
    expect(await LABEL_FRAME_HANDLERS.label_frames({ frame_set: 'frames-1' }, ctx)).toMatchObject({ ok: false });
  });

  it.each([null, new Uint8Array(16 * 1024 * 1024 + 1)])(
    'leaves labels unchanged when the image reply cannot be returned',
    async (jpeg) => {
      vi.mocked(loadFrameJpeg).mockResolvedValue(jpeg);

      expect(
        await LABEL_FRAME_HANDLERS.label_frames(
          { frame_set: 'frames-1', classes: [{ id: 1, name: 'Mug', keypoints: ['handle'] }] },
          ctx,
        ),
      ).toMatchObject({ ok: false });
      expect(saveFrameSet).not.toHaveBeenCalled();
    },
  );
});
