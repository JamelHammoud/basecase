import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visionModel } from './catalogue';
import type { FrameSet } from './frameSet';
import { prelabelFrameSet } from './prelabels';

const state = vi.hoisted(() => ({ load: vi.fn(), infer: vi.fn(), close: vi.fn(), decode: vi.fn() }));

vi.mock('./runtime', () => ({ createVisionRuntime: () => state }));

const fixture = (): FrameSet => ({
  version: 1,
  id: 'set',
  name: 'Frames',
  caseId: null,
  sceneId: null,
  seed: 1,
  classes: [],
  createdAt: '2026-01-01',
  frames: [1, 2].map((id) => ({
    id: `frame_${id}`,
    seed: id,
    camera: 'Scene',
    width: 4,
    height: 4,
    jpeg: new Uint8Array([255, 216, id, 255, 217]),
    depth: new Float32Array(16),
    annotations: [],
  })),
});

beforeEach(() => {
  state.load.mockReset().mockResolvedValue(undefined);
  state.infer.mockReset().mockResolvedValue({
    modelId: 'test',
    timestamp: 0,
    width: 4,
    height: 4,
    detections: [{ label: 'cup', score: 1, box: [0, 0, 1, 1] }],
  });
  state.close.mockReset();
  state.decode.mockReset().mockImplementation(async () => ({ width: 4, height: 4, close: vi.fn() }));
  vi.stubGlobal('createImageBitmap', state.decode);
});

afterEach(() => vi.unstubAllGlobals());

describe('frame set model prelabels', () => {
  it('loads the default model and decodes each JPEG before ordered inference', async () => {
    const source = fixture();
    const labelled = await prelabelFrameSet(source);

    expect(state.load).toHaveBeenCalledExactlyOnceWith(visionModel('rfdetr-nano'));
    expect(state.infer).toHaveBeenCalledTimes(2);
    expect(labelled.classes).toEqual([{ id: 0, name: 'cup' }]);
    expect(labelled.frames.every((frame) => frame.annotations[0].review === 'suggested')).toBe(true);
    expect(source.frames.every((frame) => frame.annotations.length === 0)).toBe(true);

    const blobs = state.decode.mock.calls.map(([blob]) => blob as Blob);

    expect(await Promise.all(blobs.map(async (blob) => [...new Uint8Array(await blob.arrayBuffer())]))).toEqual(
      source.frames.map((frame) => [...frame.jpeg]),
    );
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('uses a supplied trained model manifest and closes its private runtime after failure', async () => {
    const manifest = { ...visionModel('yolo11n')!, id: 'trained-cups', classes: ['cup'] };
    const bitmap = { width: 4, height: 4, close: vi.fn() };

    state.decode.mockResolvedValue(bitmap);
    state.infer.mockRejectedValue(new Error('Inference stopped'));
    await expect(prelabelFrameSet(fixture(), manifest)).rejects.toThrow('Inference stopped');
    expect(state.load).toHaveBeenCalledExactlyOnceWith(manifest);
    expect(state.infer).toHaveBeenCalledExactlyOnceWith('trained-cups', bitmap);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('closes the runtime when decode or loading fails and skips empty sets', async () => {
    state.decode.mockRejectedValue(new Error('JPEG stopped'));
    await expect(prelabelFrameSet(fixture())).rejects.toThrow('JPEG stopped');
    expect(state.close).toHaveBeenCalledOnce();
    state.close.mockClear();
    state.load.mockRejectedValue(new Error('Cache stopped'));
    await expect(prelabelFrameSet(fixture())).rejects.toThrow('Cache stopped');
    expect(state.close).toHaveBeenCalledOnce();

    const empty = { ...fixture(), frames: [] };

    state.load.mockClear();
    expect(await prelabelFrameSet(empty)).toBe(empty);
    expect(state.load).not.toHaveBeenCalled();
  });
});
