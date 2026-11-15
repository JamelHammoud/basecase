import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '../routines/planTypes';
import { prepareRoutineVision } from './routineVision';
import { routineCanRun, routineVisionCompilation } from './routineVisionState';

const session = vi.hoisted(() => ({
  acquire: vi.fn<(...args: unknown[]) => Promise<() => void>>(),
  release: vi.fn(),
  load: vi.fn<(...args: unknown[]) => Promise<void>>(),
  pose: vi.fn(() => false),
}));

vi.mock('../cameras/operator/operatorCamera', () => ({ operatorPoseReady: session.pose }));

vi.mock('../cameras/visionSession', () => ({
  acquireVisionCamera: session.acquire,
  ensureVisionModel: session.load,
}));

const plan = {
  watchers: [{ id: 'visitor', model: 'person-detection', rateHz: 3 }],
  ops: [{ kind: 'infer', node: 'check-face', model: 'face-detection' }],
} as Plan;

beforeEach(() => {
  vi.clearAllMocks();
  session.acquire.mockResolvedValue(session.release);
  session.load.mockResolvedValue();
});

describe('Routine camera preparation', () => {
  it('publishes the refused node to the compiler view and allows another Run to reload it', async () => {
    session.load.mockRejectedValueOnce(new Error('Unavailable'));

    const failed = await prepareRoutineVision(plan, ['wrist']);
    const refused = routineVisionCompilation(plan, failed.errors);

    expect(refused).toMatchObject({ ok: false, errors: [{ code: 'model-unavailable', path: 'visitor' }] });
    expect(routineCanRun({ compiled: refused, run: null })).toBe(true);

    const loaded = await prepareRoutineVision(plan, ['wrist']);
    const compiled = routineVisionCompilation(plan, loaded.errors);

    expect(compiled).toEqual({ ok: true, plan });
    expect(routineCanRun({ compiled, run: null })).toBe(true);
    loaded.release();
  });

  it('keeps graph errors and an active run blocked for both Run controls', () => {
    const unavailable = { code: 'model-unavailable', path: 'visitor', message: 'Load See Person again.' };
    const graph = { code: 'unknown-model', path: 'visitor', message: 'Choose a model.' };
    const run = { live: true, done: false, trace: [], said: [], failures: [] };

    expect(routineCanRun({ compiled: null, run: null })).toBe(false);
    expect(routineCanRun({ compiled: { ok: false, errors: [] }, run: null })).toBe(false);
    expect(routineCanRun({ compiled: { ok: false, errors: [unavailable, graph] }, run: null })).toBe(false);
    expect(routineCanRun({ compiled: { ok: false, errors: [unavailable] }, run })).toBe(false);
    expect(routineCanRun({ compiled: { ok: true, plan }, run })).toBe(false);
  });

  it('loads every required detector before Run and releases each request once', async () => {
    const ready = await prepareRoutineVision(plan, ['wrist']);

    expect(ready.errors).toEqual([]);
    expect(session.acquire).toHaveBeenCalledWith('wrist', {
      modelId: 'yolo11n',
      fps: 3,
      current: expect.any(Function),
    });
    expect(session.acquire).toHaveBeenCalledWith('wrist', { modelId: 'yunet', fps: 5, current: expect.any(Function) });
    ready.release();
    expect(session.release).toHaveBeenCalledTimes(2);
    ready.release();
    expect(session.release).toHaveBeenCalledTimes(2);
  });

  it('names the failed node and releases prepared models when one download fails', async () => {
    session.acquire.mockImplementation(async (_camera, options) => {
      if ((options as { modelId: string }).modelId === 'yunet') throw new Error('Network unavailable');

      return session.release;
    });

    const ready = await prepareRoutineVision(plan, ['wrist']);

    expect(ready.errors).toEqual([
      expect.objectContaining({
        code: 'model-unavailable',
        path: 'check-face',
        message: expect.stringContaining('Find Faces'),
      }),
    ]);
    ready.release();
    expect(session.release).toHaveBeenCalledOnce();
  });

  it('requires a camera for perception and leaves motion-only Routines alone', async () => {
    const missing = await prepareRoutineVision(plan, []);
    const motion = await prepareRoutineVision({ ...plan, watchers: [], ops: [] }, []);

    expect(missing.errors.map((error) => error.path)).toEqual(['visitor', 'check-face']);
    expect(motion.errors).toEqual([]);
    expect(session.acquire).not.toHaveBeenCalled();
  });

  it('reuses the active body landmarker without downloading a second pose model', async () => {
    session.pose.mockReturnValue(true);

    const ready = await prepareRoutineVision({ ...plan, watchers: [{ ...plan.watchers[0], model: 'pose' }], ops: [] }, [
      'wrist',
      'operator',
    ]);

    expect(ready.errors).toEqual([]);
    expect(session.acquire).not.toHaveBeenCalled();
  });

  it('prepares a headless render without starting a second live inference stream', async () => {
    const ready = await prepareRoutineVision(plan, ['wrist'], { rendered: true });

    expect(ready.errors).toEqual([]);
    expect(session.load.mock.calls).toEqual([['yolo11n'], ['yunet']]);
    expect(session.acquire).not.toHaveBeenCalled();
    ready.release();
    expect(session.acquire).not.toHaveBeenCalled();
    expect(session.release).not.toHaveBeenCalled();
  });
});

describe('rendered model preparation failures', () => {
  it('reports a missing rendered model without touching live assignments', async () => {
    session.load.mockRejectedValue(new Error('Unavailable'));

    const ready = await prepareRoutineVision(plan, ['wrist', 'scene'], { rendered: true });

    expect(session.load).toHaveBeenCalledTimes(2);
    expect(ready.errors.map((error) => error.path)).toEqual(['visitor', 'check-face']);
    expect(session.acquire).not.toHaveBeenCalled();
    ready.release();
    expect(session.release).not.toHaveBeenCalled();
  });
});

describe('cancelled live preparation', () => {
  it('does not configure a camera when Stop occurs while its model loads', async () => {
    let resolve: () => void = () => undefined;
    let current = true;

    session.load.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );

    const pending = prepareRoutineVision({ ...plan, ops: [] }, ['wrist'], { current: () => current });

    current = false;
    resolve();

    const prepared = await pending;

    expect(prepared.errors).toEqual([]);
    expect(session.acquire).not.toHaveBeenCalled();
    prepared.release();
    expect(session.release).not.toHaveBeenCalled();
  });
});

describe('multiple delayed model loads', () => {
  it('applies no partial assignments while another model is loading', async () => {
    let resolve: () => void = () => undefined;
    let current = true;

    session.load.mockImplementation(async (model) => {
      if (model === 'yunet')
        await new Promise<void>((done) => {
          resolve = done;
        });
    });

    const pending = prepareRoutineVision(plan, ['wrist'], { current: () => current });

    await Promise.resolve();
    await Promise.resolve();
    expect(session.acquire).not.toHaveBeenCalled();
    current = false;
    resolve();

    const prepared = await pending;

    prepared.release();
    expect(session.acquire).not.toHaveBeenCalled();
    expect(session.release).not.toHaveBeenCalled();
  });
});
