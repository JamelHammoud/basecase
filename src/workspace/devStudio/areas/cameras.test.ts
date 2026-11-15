import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Studio, StudioContext } from '../types';
import camerasStudio from './cameras';

const captures = vi.hoisted(() => ({
  feed: vi.fn(),
  load: vi.fn(),
  frame: vi.fn(),
  dispose: vi.fn(),
  encode: vi.fn(),
}));

vi.mock('../../../cameras/viewsClient', () => ({ cameraFeed: captures.feed }));
vi.mock('../../../utils/imageEncode', () => ({ encodeBitmap: captures.encode }));
vi.mock('../../../cameras/liveFeed', () => ({ streamCost: {} }));
vi.mock('../../../cameras/operator/operatorCamera', () => ({}));
vi.mock('../../../phone/phoneStore', () => ({}));
vi.mock('../../../cameras/visionSession', () => ({ loadVisionManifest: vi.fn() }));

function fixture() {
  const simulated = {};
  const model = { xml: '<mujoco />' };
  const poses = new Float64Array([0, 1, 2]);
  const context = {
    core: {
      parts: [],
      project: { cameras: [] },
      vision: { simulated },
      simTraining: { sim: { model, worldParts: [] } },
    },
    posesRef: { current: poses },
  } as unknown as StudioContext;
  const studio: Studio = () => context;

  return { hooks: camerasStudio(studio), simulated, poses, model };
}

beforeEach(() => {
  vi.resetAllMocks();
  captures.feed.mockReturnValue({
    load: captures.load,
    frame: captures.frame,
    dispose: captures.dispose,
  });
  captures.load.mockResolvedValue(undefined);
});

describe('floor camera captures', () => {
  it('encodes the matching worker bitmap through the scene vision source', async () => {
    const { hooks, simulated, poses, model } = fixture();
    const bitmap = { close: vi.fn() };

    captures.frame.mockResolvedValue({ bitmaps: { scene: bitmap }, vision: {} });
    captures.encode.mockResolvedValue('data:image/png;base64,frame');

    expect(await hooks.cameraFrame('scene', true)).toBe('data:image/png;base64,frame');
    expect(captures.feed).toHaveBeenCalledWith(simulated);
    expect(captures.load).toHaveBeenCalledWith(expect.objectContaining({ model }));
    expect(captures.frame).toHaveBeenCalledWith({ keys: ['scene'], poses });
    expect(captures.frame.mock.calls[0][0].poses).not.toBe(poses);
    expect(captures.encode).toHaveBeenCalledWith({ bitmap, type: 'image/png' });
    expect(captures.dispose).toHaveBeenCalledOnce();
  });

  it('releases the feed when the requested camera is absent', async () => {
    const { hooks } = fixture();

    captures.frame.mockResolvedValue({ bitmaps: {}, vision: {} });

    expect(await hooks.cameraFrame('missing', true)).toBeNull();
    expect(captures.encode).not.toHaveBeenCalled();
    expect(captures.dispose).toHaveBeenCalledOnce();
  });

  it('releases the feed when the worker fails', async () => {
    const { hooks } = fixture();

    captures.frame.mockRejectedValue(new Error('Capture failed'));

    await expect(hooks.cameraFrame('scene', true)).rejects.toThrow('Capture failed');
    expect(captures.dispose).toHaveBeenCalledOnce();
  });
});
