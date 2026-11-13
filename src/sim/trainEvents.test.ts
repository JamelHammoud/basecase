import { describe, expect, it, vi } from 'vitest';
import { handleTrainEvent, type TrainEventContext, type TrainJob } from './trainEvents';

function context(job: TrainJob | null) {
  const onSnapshot = vi.fn();
  const ctx: TrainEventContext = {
    job: { current: job },
    onPolicy: vi.fn(),
    setMessage: vi.fn(),
    setStatus: vi.fn(),
    setProgress: vi.fn(),
    setCurve: vi.fn(),
    setError: vi.fn(),
    setTrainer: vi.fn(),
    onSnapshot,
  };

  return { ctx, onSnapshot };
}

const snapshot = (jobId: string, iteration: number) => ({
  type: 'train-progress',
  workspaceId: 'w',
  jobId,
  kind: 'snapshot',
  iteration,
  steps: iteration * 192,
});

describe('snapshot events', () => {
  it('hand the current job’s snapshot to the canvas', () => {
    const { ctx, onSnapshot } = context({ id: 'policy-now', task: 'walk', replaces: null });

    handleTrainEvent(ctx, 'w', snapshot('policy-now', 50));

    expect(onSnapshot).toHaveBeenCalledWith({ run: 'policy-now', iteration: 50, steps: 9600 });
  });

  it('ignore a stale job’s snapshot, another scene’s and one with no job running', () => {
    const { ctx, onSnapshot } = context({ id: 'policy-now', task: 'walk', replaces: null });

    handleTrainEvent(ctx, 'w', snapshot('policy-before', 50));
    handleTrainEvent(ctx, 'other', snapshot('policy-now', 50));
    handleTrainEvent(context(null).ctx, 'w', snapshot('policy-now', 50));

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('take the job id from the first event while the start is still answering', () => {
    const job: TrainJob = { id: null, task: 'stand', replaces: null };
    const { ctx, onSnapshot } = context(job);

    handleTrainEvent(ctx, 'w', snapshot('policy-new', 10));
    handleTrainEvent(ctx, 'w', snapshot('policy-old', 20));

    expect(job.id).toBe('policy-new');
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('skip a snapshot without a whole iteration', () => {
    const { ctx, onSnapshot } = context({ id: 'policy-now', task: 'walk', replaces: null });

    handleTrainEvent(ctx, 'w', { ...snapshot('policy-now', 50), iteration: '../50' });

    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
