import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposePoseVision, loadPoseVision } from './poseInference';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../cameras/operator/landmarkers', () => ({ loadPoseLandmarker: load }));

afterEach(() => {
  disposePoseVision();
  load.mockReset();
});

const loadedPose = () => ({ landmarker: { close: vi.fn() }, delegate: 'CPU' });

function pendingPose() {
  let settle: ((model: ReturnType<typeof loadedPose>) => void) | undefined;
  const promise = new Promise<ReturnType<typeof loadedPose>>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: (model: ReturnType<typeof loadedPose>) => settle?.(model) };
}

describe('shared pose model lifetime', () => {
  it('loads one landmarker for concurrent camera requests', async () => {
    const model = loadedPose();

    load.mockResolvedValue(model);

    await Promise.all([loadPoseVision(), loadPoseVision()]);

    expect(load).toHaveBeenCalledTimes(1);

    disposePoseVision();

    expect(model.landmarker.close).toHaveBeenCalledTimes(1);
  });

  it('keeps a reopened session when the previous model finishes loading late', async () => {
    const oldModel = loadedPose();
    const nextModel = loadedPose();
    const old = pendingPose();
    const reopened = pendingPose();

    load.mockReturnValueOnce(old.promise);

    const previous = loadPoseVision();
    const refused = expect(previous).rejects.toThrow('The camera is closed.');

    disposePoseVision();
    load.mockReturnValueOnce(reopened.promise);

    const next = loadPoseVision();

    old.resolve(oldModel);
    await refused;

    expect(loadPoseVision()).toBe(next);

    reopened.resolve(nextModel);
    await next;

    expect(load).toHaveBeenCalledTimes(2);
    expect(oldModel.landmarker.close).toHaveBeenCalledTimes(1);
    expect(nextModel.landmarker.close).not.toHaveBeenCalled();
  });
});
