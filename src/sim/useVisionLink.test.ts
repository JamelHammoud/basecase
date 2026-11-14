import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearVisionResults, keepVisionResult } from '../vision/resultStore';
import type { VisionResult } from '../vision/protocol';
import * as visionLink from './useVisionLink';

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('./visionLink', () => ({
  VisionLink: class {
    stop = vi.fn();
  },
}));

function mount(active: boolean) {
  const postMessage = vi.fn();

  visionLink.useVisionLink({ current: { postMessage } as unknown as Worker }, vi.fn(), active);

  const cleanups = effects.splice(0).map((effect) => effect());

  return { postMessage, close: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

const frame: VisionResult = {
  modelId: 'object-detection',
  camera: 'scene',
  kind: 'detect',
  timestamp: 100,
  elapsedMs: 1,
  width: 320,
  height: 240,
  detections: [],
};

afterEach(() => clearVisionResults());

describe('simulation vision ownership', () => {
  it('delivers live detections only to the foreground scene and disconnects it on tab change', () => {
    const foreground = mount(true);
    const background = mount(false);

    keepVisionResult(frame);
    expect(foreground.postMessage).toHaveBeenCalledWith({ type: 'vision', result: frame, ageMs: expect.any(Number) });
    expect(background.postMessage).not.toHaveBeenCalled();
    foreground.close();

    const next = mount(true);

    keepVisionResult({ ...frame, timestamp: 200 });
    expect(foreground.postMessage).toHaveBeenCalledTimes(1);
    expect(background.postMessage).not.toHaveBeenCalled();
    expect(next.postMessage).toHaveBeenCalledOnce();
    next.close();
    background.close();
  });

  it('keeps recorded detections out of the live coordinator', () => {
    const foreground = mount(true);

    keepVisionResult({ ...frame, mediaTime: 1, mediaSource: 'try' });
    expect(foreground.postMessage).not.toHaveBeenCalled();
    foreground.close();
  });
});
