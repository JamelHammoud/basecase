import { useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { CameraVision } from './scopedVision';
import { LiveFeed } from './liveFeed';
import { useCameraFeed, type CameraFeedInput } from './useCameraFeed';

const state = vi.hoisted(() => ({ simulated: {} as CameraVision, refs: [] as { current: unknown }[], cursor: 0 }));

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useEffectEvent: (callback: unknown) => callback,
  useRef: (current: unknown) => {
    const index = state.cursor++;

    state.refs[index] ??= { current };

    return state.refs[index];
  },
  useState: () => [0, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => boolean) => snapshot(),
}));
vi.mock('./visionScope', () => ({ useVisionScope: () => ({ simulated: state.simulated }) }));
vi.mock('./liveFeed', () => ({
  LiveFeed: vi.fn(
    class {
      scene = vi.fn();
      model = vi.fn();
      views = vi.fn();
      dispose = vi.fn();
      link = vi.fn();
    },
  ),
}));

function cameraVision() {
  return {
    ensureVisionCamera: vi.fn(async () => undefined),
    onVisionAssignments: vi.fn(),
    registerVisionCameras: vi.fn(() => vi.fn()),
    visionNeedsFrames: () => false,
  } as unknown as CameraVision;
}

function feedRenders() {
  let previous: Parameters<typeof useEffect>[] = [];
  const cleanups = new Map<number, () => void>();

  return (input: CameraFeedInput) => {
    state.cursor = 0;
    vi.mocked(useEffect).mockClear();
    useCameraFeed(input);

    const next = vi.mocked(useEffect).mock.calls;
    const changed = next.map(([, deps], index) => !deps?.every((dep, i) => Object.is(dep, previous[index]?.[1]?.[i])));

    changed.forEach((run, index) => {
      if (run) cleanups.get(index)?.();
    });
    changed.forEach((run, index) => {
      if (!run) return;

      const cleanup = next[index][0]();

      if (cleanup) cleanups.set(index, cleanup);
      else cleanups.delete(index);
    });
    previous = [...next];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.refs = [];
  state.simulated = cameraVision();
});

it.each(['scene scope', 'simulation link'])(
  'initializes replacement camera feeds after a %s change with unchanged inputs',
  (change) => {
    const render = feedRenders();
    const input: CameraFeedInput = {
      active: true,
      parts: [],
      world: [],
      model: null,
      views: [],
      enlarged: null,
      connectCameras: vi.fn(),
      onFrames: vi.fn(),
    };

    render(input);

    const first = vi.mocked(LiveFeed).mock.results[0].value as LiveFeed;

    if (change === 'scene scope') state.simulated = cameraVision();
    else input.connectCameras = vi.fn();

    render(input);

    const replacement = vi.mocked(LiveFeed).mock.results[1].value as LiveFeed;

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(replacement.scene).toHaveBeenCalledExactlyOnceWith(input.parts, input.world, input.imported);
    expect(replacement.model).toHaveBeenCalledExactlyOnceWith(input.model);
    expect(replacement.views).toHaveBeenCalledExactlyOnceWith(input.views, { enlarged: null });
    render(input);
    expect(LiveFeed).toHaveBeenCalledTimes(2);
    expect(replacement.scene).toHaveBeenCalledOnce();
    render({ ...input, active: false });
    expect(replacement.dispose).toHaveBeenCalledOnce();
  },
);
