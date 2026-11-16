import { beforeEach, describe, expect, it, vi } from 'vitest';
import { platformBridge } from '../utils/platformBridge';
import { fixtureModel } from './fixtureModels';
import { holdingPolicy } from './hubSkillFixtures';
import { kitJob } from './kitJob';
import { trainerForge } from './trainerForge';

vi.mock('../utils/platformBridge', () => ({
  platformBridge: {
    trainStart: vi.fn(),
    trainStop: vi.fn(),
    subscribeEvents: vi.fn(),
    getPolicy: vi.fn(),
    deletePolicy: vi.fn(),
    kitRequest: vi.fn(),
    kitCancel: vi.fn(),
    trainStatus: vi.fn(),
  },
}));

const model = fixtureModel('quad-servo');
const job = { name: 'Stand', xml: model.xml, job: kitJob(model, 'stand', { minutes: 1, seed: 1 }) };
let listener = (_event: Record<string, unknown>) => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(platformBridge.subscribeEvents).mockImplementation((callback) => {
    listener = callback;

    return () => {};
  });
  vi.mocked(platformBridge.trainStart).mockImplementation(async () => {
    listener({
      type: 'train-progress',
      kind: 'done',
      jobId: 'policy-remote',
      record: { id: 'policy-remote', trainedSteps: 4 },
    });

    return { jobId: 'policy-remote' };
  });
  vi.mocked(platformBridge.deletePolicy).mockResolvedValue(true);
  vi.mocked(platformBridge.trainStop).mockResolvedValue({ stopping: true });
});

describe('warm policy runner availability', () => {
  it('keeps background reuse cold when remote Forge masks an unavailable local Python runner', async () => {
    const options = { workspaceId: 'warm', background: true, onProgress: () => {} };

    vi.mocked(platformBridge.trainStatus).mockResolvedValue({
      ready: true,
      uv: true,
      running: [],
      engine: 'forge',
      local: { ready: false, engine: 'python' },
    });
    expect(await trainerForge(options).canWarm?.()).toBe(false);
    vi.mocked(platformBridge.trainStatus).mockResolvedValue({
      ready: true,
      uv: true,
      running: [],
      engine: 'forge',
      local: { ready: true, engine: 'forge' },
    });
    expect(await trainerForge(options).canWarm?.()).toBe(true);
  });

  it('admits native local and foreground remote warm starts while keeping Python and background work local', async () => {
    const options = { workspaceId: 'warm', background: false, onProgress: () => {} };

    vi.mocked(platformBridge.trainStatus).mockResolvedValue({ ready: true, uv: true, running: [], engine: 'python' });
    expect(await trainerForge(options).canWarm?.()).toBe(false);
    vi.mocked(platformBridge.trainStatus).mockResolvedValue({ ready: true, uv: true, running: [], engine: 'forge' });
    expect(await trainerForge(options).canWarm?.()).toBe(true);
    vi.mocked(platformBridge.trainStatus).mockClear();
    expect(await trainerForge({ ...options, recoveryKey: 'frozen-remote' }).canWarm?.()).toBe(true);
    expect(platformBridge.trainStatus).not.toHaveBeenCalled();
    vi.mocked(platformBridge.trainStatus).mockResolvedValue({ ready: true, uv: true, running: [], engine: 'python' });
    expect(await trainerForge({ ...options, background: true, recoveryKey: 'ignored' }).canWarm?.()).toBe(false);
  });
});

describe('returning a remote Forge result', () => {
  it('keeps actual work when every child fails', async () => {
    vi.mocked(platformBridge.trainStart).mockImplementationOnce(async () => {
      listener({
        type: 'train-progress',
        kind: 'error',
        jobId: 'policy-remote',
        message: 'Every training attempt failed.',
        candidates: [7, 11].map((steps, index) => ({
          id: `policy-child-${index}`,
          seed: index,
          steps,
          fingerprint: {},
          development: null,
          outcome: { kind: 'error', message: 'Child failed' },
        })),
      });

      return { jobId: 'policy-remote' };
    });

    const outcome = await trainerForge({ workspaceId: 'scene', background: false, onProgress: () => {} })(job);

    expect(outcome.ok).toBe(false);
    expect(outcome.events).toEqual([{ type: 'done', steps: 18 }]);
    expect(outcome.stderr).toBe('Every training attempt failed.');
    expect(platformBridge.getPolicy).not.toHaveBeenCalled();
  });

  it('reuses the workflow and call identity across a studio restart', async () => {
    vi.mocked(platformBridge.getPolicy).mockResolvedValue(holdingPolicy(job.job));

    const options = { workspaceId: 'scene', background: false, recoveryKey: 'workflow', onProgress: () => {} };
    const first = trainerForge(options);

    await first(job);
    await first(job);
    await trainerForge(options)(job);
    expect(vi.mocked(platformBridge.trainStart).mock.calls.map(([payload]) => payload.recoveryKey)).toEqual([
      'workflow:0',
      'workflow:1',
      'workflow:0',
    ]);
  });

  it('stops only the active stage and detaches without stopping on studio disposal', async () => {
    vi.mocked(platformBridge.getPolicy).mockResolvedValue(holdingPolicy(job.job));

    const controller = new AbortController();
    const options = {
      workspaceId: 'scene',
      background: false,
      recoveryKey: 'workflow',
      onProgress: () => {},
      signal: controller.signal,
    };
    const runner = trainerForge(options);

    await runner(job);
    vi.mocked(platformBridge.trainStart).mockResolvedValue({ jobId: 'policy-remote' });

    const active = runner(job);

    controller.abort();
    await active;
    expect(platformBridge.trainStop).toHaveBeenCalledTimes(1);

    const closing = new AbortController();
    const detached = trainerForge({ ...options, signal: closing.signal })(job);

    closing.abort('detach');
    await detached;
    expect(platformBridge.trainStop).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed network policy before it reaches local evaluation', async () => {
    const malformed = holdingPolicy(job.job);

    malformed.layers[0].w[0] = Infinity;
    vi.mocked(platformBridge.getPolicy).mockResolvedValue(malformed);

    const runner = trainerForge({ workspaceId: 'scene', background: false, onProgress: () => {} });
    const outcome = await runner(job);

    expect(outcome.ok).toBe(false);
    expect(outcome.policy).toBeNull();
    expect(outcome.stderr).toBe('The trainer saved no policy.');
  });

  it('delivers Stop after an in-flight start creates its job and keeps detach recoverable', async () => {
    for (const reason of [undefined, 'detach']) {
      vi.mocked(platformBridge.trainStop).mockClear();

      let accept = (_reply: { jobId: string }) => {};

      vi.mocked(platformBridge.trainStart).mockImplementationOnce(() => new Promise((resolve) => (accept = resolve)));

      const controller = new AbortController();
      const running = trainerForge({
        workspaceId: 'scene',
        background: false,
        recoveryKey: 'workflow',
        onProgress: () => {},
        signal: controller.signal,
      })(job);

      controller.abort(reason);
      await running;
      expect(platformBridge.trainStop).not.toHaveBeenCalled();
      accept({ jobId: 'policy-remote' });
      await Promise.resolve();
      expect(platformBridge.trainStop).toHaveBeenCalledTimes(reason === 'detach' ? 0 : 1);
    }
  });

  it('cancels a background request immediately while the Kit scheduler is still debouncing it', async () => {
    let cancel = () => {};

    vi.mocked(platformBridge.kitRequest).mockImplementationOnce(
      () => new Promise((resolve) => (cancel = () => resolve({ jobId: null }))),
    );
    vi.mocked(platformBridge.kitCancel).mockImplementationOnce(async () => {
      cancel();

      return { ok: true };
    });

    const controller = new AbortController();
    const running = trainerForge({
      workspaceId: 'scene',
      background: true,
      onProgress: () => {},
      signal: controller.signal,
    })(job);

    controller.abort();
    expect(platformBridge.kitCancel).toHaveBeenCalledWith('scene');
    await running;
    expect(platformBridge.trainStop).not.toHaveBeenCalled();
  });
});
