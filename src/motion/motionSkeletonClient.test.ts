import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waveBvh } from '../utils/motionSkeleton.fixtures';

const workers: MotionWorker[] = [];
const request = { text: waveBvh(), heightMm: 300, toleranceMm: 2 };

class MotionWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    workers.push(this);
  }
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('motion fitting worker client', () => {
  it('returns a design only after its worker replies', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', MotionWorker);

    const { designMotionInWorker } = await import('./motionSkeletonClient');
    const waiting = designMotionInWorker(request);
    const worker = workers.at(-1)!;
    const result = { problem: 'The motion has no moving joints.' };

    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, op: 'design', payload: request }, []);
    worker.onmessage?.({ data: { id: 1, result } });
    await expect(waiting).resolves.toEqual(result);
  });

  it('refuses an unavailable browser worker instead of running the fit on the page', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', undefined);

    const { designMotionInWorker } = await import('./motionSkeletonClient');

    await expect(designMotionInWorker(request)).rejects.toThrow('worker is unavailable');
  });

  it('refuses a failed browser worker instead of rerunning the fit on the page', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', MotionWorker);

    const { designMotionInWorker } = await import('./motionSkeletonClient');
    const waiting = designMotionInWorker(request);
    const worker = workers.at(-1)!;

    worker.onerror?.({ message: 'Worker failed' });
    await expect(waiting).rejects.toThrow('worker is unavailable');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('keeps the shared fitting and catalog sizing pipeline available outside the browser', async () => {
    vi.stubGlobal('Worker', undefined);

    const { designMotionInWorker } = await import('./motionSkeletonClient');
    const result = await designMotionInWorker(request);

    expect(result).not.toHaveProperty('problem');

    if ('problem' in result) throw new Error(result.problem);

    expect(result.skeleton.joints).toHaveLength(3);
    expect(result.skeleton.joints.every((joint) => joint.actuator?.startsWith('component:'))).toBe(true);
    expect(Object.values(result.errors).every((error) => error <= request.toleranceMm)).toBe(true);
  });
});
