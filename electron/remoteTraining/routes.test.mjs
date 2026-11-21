import { describe, expect, it, vi } from 'vitest';
import { remoteTrainingPostRoutes, registerRemoteTrainingHandlers } from './routes.mjs';

describe('training computer routes', () => {
  it('shares the same validated configuration boundary over trusted IPC and guarded HTTP', async () => {
    const training = {
      status: vi.fn(() => ({ selected: false })),
      configure: vi.fn(async () => ({ selected: true })),
      clear: vi.fn(() => ({ selected: false })),
      recordSelection: vi.fn(() => true),
    };
    const handlers = new Map();
    const config = { host: 'trainer.local', user: 'robot', key: '/keys/training', hostKey: 'ssh-ed25519 key' };

    registerRemoteTrainingHandlers({ handle: (channel, handler) => handlers.set(channel, handler) }, training);
    expect([...handlers.keys()]).toEqual([
      'remote-training:status',
      'remote-training:configure',
      'remote-training:clear',
      'remote-training:selection',
    ]);
    expect(await handlers.get('remote-training:configure')({}, config)).toEqual({ selected: true });
    expect(training.configure).toHaveBeenLastCalledWith(config);

    const routes = new Map(remoteTrainingPostRoutes(training));

    expect(await routes.get('/remote-training-status')({})).toEqual({ selected: false });
    expect(await routes.get('/remote-training-configure')({ arg: config })).toEqual({ selected: true });
    expect(training.configure).toHaveBeenLastCalledWith(config);
    expect(await routes.get('/remote-training-clear')({})).toEqual({ selected: false });
    expect(await routes.get('/remote-training-selection')({ arg: { selected: 'policy-child' } })).toBe(true);
    expect(training.recordSelection).toHaveBeenCalledWith({ selected: 'policy-child' });
  });
});
