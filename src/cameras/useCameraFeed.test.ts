import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraView } from './views';

const lifecycle = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  feeds: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  inferred: ['wrist'] as readonly string[],
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => lifecycle.effects.push(effect),
  useEffectEvent: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('../vision/client', () => ({
  onVisionCameras: vi.fn(),
  visionCameras: () => lifecycle.inferred,
}));
vi.mock('./liveFeed', () => ({
  LiveFeed: class {
    readonly dispose = vi.fn();

    readonly scene = vi.fn(async () => undefined);

    readonly model = vi.fn();

    readonly views = vi.fn();

    readonly stream = vi.fn();

    readonly link = vi.fn();

    constructor() {
      lifecycle.feeds.push(this);
    }
  },
}));

import * as cameraFeed from './useCameraFeed';

const view: CameraView = {
  key: 'wrist',
  label: 'Wrist',
  part: null,
  position: [0, 100, 200],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovDeg: 45,
  lens: { model: 'pinhole', hfovDeg: 60 },
};

function mount(eligible: boolean) {
  const connectCameras = vi.fn();

  cameraFeed.useCameraFeed({
    active: true,
    eligible,
    parts: [],
    world: [],
    model: null,
    views: [view],
    enlarged: null,
    connectCameras,
    onFrames: vi.fn(),
  });

  const cleanups = lifecycle.effects.splice(0).map((effect) => effect());

  return { connectCameras, close: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

beforeEach(() => {
  lifecycle.effects.length = 0;
  lifecycle.feeds.length = 0;
});

describe('scene camera feed ownership', () => {
  it('does not create a feed or register a pose connection for an inactive scene even when vision requests it', () => {
    const inactive = mount(false);

    expect(lifecycle.feeds).toHaveLength(0);
    expect(inactive.connectCameras).not.toHaveBeenCalled();
    inactive.close();
    expect(inactive.connectCameras).not.toHaveBeenCalled();
  });

  it('disconnects the old active feed before another scene takes ownership', () => {
    const first = mount(true);

    expect(lifecycle.feeds).toHaveLength(1);
    expect(first.connectCameras).toHaveBeenCalledWith(expect.any(Function));
    first.close();
    expect(first.connectCameras).toHaveBeenLastCalledWith(null);
    expect(lifecycle.feeds[0].dispose).toHaveBeenCalledOnce();

    const background = mount(false);
    const next = mount(true);

    expect(background.connectCameras).not.toHaveBeenCalled();
    expect(lifecycle.feeds).toHaveLength(2);
    next.close();
    background.close();
    expect(lifecycle.feeds.every((feed) => feed.dispose.mock.calls.length === 1)).toBe(true);
  });
});
