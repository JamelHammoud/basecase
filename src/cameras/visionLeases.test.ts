import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ load: vi.fn<(...args: unknown[]) => Promise<void>>() }));

vi.mock('../vision/runtime', () => ({
  visionRuntime: () => ({ load: runtime.load, subscribe: vi.fn(), onError: vi.fn() }),
}));

beforeEach(() => {
  vi.resetModules();
  runtime.load.mockReset().mockResolvedValue();
});

const setup = () => import('./visionSession');

describe('camera inference ownership', () => {
  it('releases overlapping requests in either order while preserving the baseline', async () => {
    const session = await setup();

    await session.configureVisionCamera('wrist', { modelId: 'yolo11n', fps: 2, continuous: false });

    const releaseA = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 4, current: () => true });
    const releaseB = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 9, current: () => true });

    expect(session.visionAssignments()).toEqual([{ camera: 'wrist', modelId: 'yolo11n', fps: 9, continuous: true }]);
    releaseA();
    expect(session.visionNeedsFrames(['wrist'])).toBe(true);
    expect(session.visionAssignments()[0].fps).toBe(9);
    releaseB();
    expect(session.visionAssignments()).toEqual([{ camera: 'wrist', modelId: 'yolo11n', fps: 2, continuous: false }]);
    expect(session.visionNeedsFrames(['wrist'])).toBe(false);
    releaseA();
    releaseB();
    expect(session.visionAssignments()[0].fps).toBe(2);
  });

  it('removes only the latest request when it finishes before an older one', async () => {
    const session = await setup();
    const releaseA = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 4, current: () => true });
    const releaseB = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 9, current: () => true });

    releaseB();
    expect(session.visionAssignments()[0]).toMatchObject({ fps: 4, continuous: true });
    releaseA();
    expect(session.visionAssignments()).toEqual([]);
  });

  it('keeps baseline changes made while a request is active', async () => {
    const session = await setup();

    await session.configureVisionCamera('wrist', { modelId: 'yolo11n', fps: 2, continuous: false });

    const release = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 9, current: () => true });

    await session.configureVisionCamera('wrist', { modelId: 'yolo11n', fps: 6, continuous: true });
    release();
    expect(session.visionAssignments()[0]).toMatchObject({ fps: 6, continuous: true });
  });

  it('creates no request when Stop happens during model loading', async () => {
    const session = await setup();
    let finish: () => void = () => undefined;
    let current = true;

    runtime.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const pending = session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 9, current: () => current });

    current = false;
    finish();

    const release = await pending;

    expect(session.visionAssignments()).toEqual([]);
    release();
    expect(session.visionNeedsFrames(['wrist'])).toBe(false);
  });

  it('does not resurrect cleared owners when a source closes and reopens', async () => {
    const session = await setup();
    const close = session.registerVisionCameras({}, ['wrist']);

    await session.configureVisionCamera('wrist', { modelId: 'yolo11n', continuous: false });

    const releaseOld = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 12, current: () => true });

    close();
    session.registerVisionCameras({}, ['wrist']);
    await session.configureVisionCamera('wrist', { modelId: 'yolo11n', fps: 3, continuous: false });
    releaseOld();
    expect(session.visionAssignments()).toEqual([{ camera: 'wrist', modelId: 'yolo11n', fps: 3, continuous: false }]);
  });

  it('ignores an acquisition still loading when its camera source disappears', async () => {
    const session = await setup();
    const close = session.registerVisionCameras({}, ['wrist']);
    let finish: () => void = () => undefined;

    runtime.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const pending = session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 9, current: () => true });

    close();
    session.registerVisionCameras({}, ['wrist']);
    finish();
    await pending;
    expect(session.visionAssignments()).toEqual([]);
  });
});

describe('acquisition commit boundary', () => {
  it('rechecks cancellation after the final model await before publishing an assignment', async () => {
    const session = await setup();
    const configured = vi.fn();
    const loaded = Promise.resolve();
    let current = true;

    runtime.load.mockReturnValue(loaded);
    session.onVisionAssignments(configured);

    const pending = session.acquireVisionCamera('wrist', { modelId: 'yolo11n', current: () => current });

    await loaded;
    queueMicrotask(() => {
      current = false;
    });

    const release = await pending;

    expect(session.visionAssignments()).toEqual([]);
    expect(configured).not.toHaveBeenCalled();
    release();
  });

  it('keeps a new source owner when an old source lease is released', async () => {
    const session = await setup();
    const close = session.registerVisionCameras({}, ['wrist']);
    const releaseOld = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 12, current: () => true });

    close();
    session.registerVisionCameras({}, ['wrist']);

    const releaseNew = await session.acquireVisionCamera('wrist', { modelId: 'yolo11n', fps: 3, current: () => true });

    releaseOld();
    expect(session.visionAssignments()).toEqual([{ camera: 'wrist', modelId: 'yolo11n', fps: 3, continuous: true }]);
    releaseNew();
    expect(session.visionAssignments()).toEqual([]);
  });
});
