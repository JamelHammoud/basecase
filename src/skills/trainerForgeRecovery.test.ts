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

describe('returning a remote Forge result', () => {
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
});
