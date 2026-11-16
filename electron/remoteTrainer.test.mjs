import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { RemoteTrainer } from './remoteTrainer.mjs';
import { PRIORITY } from './trainer.mjs';

const cleanups = [];

afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
});

function fixture() {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-trainer-'));
  const events = [];
  const service = {
    selected: () => true,
    descriptors: () => [],
    prepare: vi.fn(async (entry) => ({ ...entry, state: 'prepared' })),
    dispatch: vi.fn(async () => {}),
    poll: vi.fn(async () => ({ state: 'running', events: [], stderr: '' })),
    stop: vi.fn(async () => {}),
    markCompleted: vi.fn(),
  };
  const make = () => new RemoteTrainer({ libraryDir: library, emit: (e) => events.push(e), remote: service });
  const trainer = make();

  cleanups.push(() => {
    trainer.dispose();
    fs.rmSync(library, { recursive: true, force: true });
  });

  return { trainer, make, service, events, library };
}

const request = (overrides = {}) => ({
  workspaceId: 'skill:scene',
  recoveryKey: 'workflow:0',
  xml: '<mujoco/>',
  job: { name: 'Stand', task: 'stand', fingerprint: 'design' },
  ...overrides,
});

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};

describe('the shared remote training queue', () => {
  it('keeps training without a durable workflow on the local runner', () => {
    const { trainer, service } = fixture();
    const child = new EventEmitter();

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    trainer.forge = 'fixture-forge';
    trainer.spawnTrainer = vi.fn(() => child);
    trainer.start(request({ recoveryKey: undefined }));
    expect(trainer.spawnTrainer).toHaveBeenCalledOnce();
    expect(service.prepare).not.toHaveBeenCalled();
  });

  it('leaves native pending jobs untouched in a backend without secure storage', async () => {
    const { trainer, service, make } = fixture();
    const started = trainer.start(request());

    await flush();
    trainer.dispose();
    service.available = () => false;

    const preview = make();

    cleanups.push(() => preview.dispose());
    await flush();
    expect(() => preview.start(request())).toThrow('Secure storage');
    expect(service.poll).toHaveBeenCalledOnce();
    expect(preview.remoteEntries.find((entry) => entry.id === started.jobId).outcome).toBeUndefined();
  });

  it('uses the existing queue and waits for a yielded local Kit process to close', async () => {
    const { trainer, service } = fixture();
    const child = new EventEmitter();

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    trainer.forge = 'fixture-forge';
    trainer.spawnTrainer = vi.fn(() => child);
    trainer.start(request({ workspaceId: 'kit:local', recoveryKey: undefined, priority: PRIORITY.kit }));
    trainer.start(request());
    await flush();
    expect(service.dispatch).not.toHaveBeenCalled();
    expect(trainer.status().queued).toEqual(['skill:scene']);
    child.emit('close', 0);
    await flush();
    expect(service.dispatch).toHaveBeenCalledOnce();
    expect(trainer.status().queued).toEqual(['kit:local']);
    expect(trainer.spawnTrainer).toHaveBeenCalledOnce();
  });

  it('removes a stopped queued remote job durably before dispatch', async () => {
    const { trainer, service, make } = fixture();

    trainer.start(request());
    trainer.start(request({ workspaceId: 'other-scene', recoveryKey: 'queued:0' }));
    await flush();
    expect(service.dispatch).toHaveBeenCalledOnce();
    trainer.stop('other-scene');
    trainer.dispose();

    const recovered = make();

    cleanups.push(() => recovered.dispose());
    await flush();
    expect(recovered.status().running).toEqual(['skill:scene']);
    expect(recovered.status().queued).toEqual([]);
    expect(service.dispatch).toHaveBeenCalledOnce();
  });

  it('reserves an already dispatched job at startup and replays earlier stages while it runs', async () => {
    const { trainer, service, make } = fixture();

    service.poll.mockResolvedValueOnce({ state: 'failed', events: [], stderr: 'first stage', code: 1 });
    trainer.start(request());
    await flush();
    trainer.start(request({ recoveryKey: 'workflow:1' }));
    await flush();
    trainer.dispose();

    const recovered = make();

    cleanups.push(() => recovered.dispose());
    service.selected = () => false;
    recovered.forge = 'fixture-forge';
    recovered.spawnTrainer = vi.fn();
    await flush();
    recovered.start(request());
    recovered.start(request({ workspaceId: 'local-scene', recoveryKey: undefined }));
    await flush();
    expect(recovered.status().running).toEqual(['skill:scene']);
    expect(recovered.status().queued).toEqual(['local-scene']);
    expect(recovered.spawnTrainer).not.toHaveBeenCalled();
    expect(service.dispatch).toHaveBeenCalledTimes(2);
  });
});

describe('remote training dispatch and recovery', () => {
  it('reserves the default workspace and refuses reattachment behind a different active workflow', async () => {
    const { trainer, service } = fixture();

    service.poll.mockResolvedValueOnce({ state: 'failed', events: [], stderr: 'forge failed', code: 1 });
    trainer.start(request({ workspaceId: undefined }));
    expect(() => trainer.start(request({ workspaceId: undefined, recoveryKey: 'other:0' }))).toThrow('already');
    await flush();
    trainer.start(request({ workspaceId: undefined, recoveryKey: 'other:0' }));
    expect(() => trainer.start(request({ workspaceId: undefined }))).toThrow('already');
    await flush();
  });

  it('persists the request before dispatch and reattaches after restart without dispatching twice', async () => {
    const { trainer, make, service, library } = fixture();
    const started = trainer.start(request());

    await flush();
    expect(service.dispatch).toHaveBeenCalledOnce();
    expect(fs.existsSync(path.join(library, 'training', started.jobId, 'remote-request.json'))).toBe(true);
    trainer.dispose();

    const recovered = make();

    cleanups.push(() => recovered.dispose());
    expect(recovered.start(request())).toEqual(started);
    await flush();
    expect(service.dispatch).toHaveBeenCalledOnce();
    expect(service.poll).toHaveBeenCalledTimes(2);
  });

  it('keeps transport loss pending and writes Stop after reconnect', async () => {
    const { trainer, service, events } = fixture();

    service.poll.mockRejectedValueOnce(Object.assign(new Error('transport lost'), { reconnect: true }));
    trainer.start(request());
    await flush();
    expect(events.some((e) => e.kind === 'error')).toBe(false);
    trainer.stop('skill:scene');
    await flush();
    expect(service.stop).toHaveBeenCalledOnce();
    expect(service.dispatch).toHaveBeenCalledOnce();
  });

  it('refuses changed inputs under the same recovery identity', async () => {
    const { trainer, make } = fixture();

    trainer.start(request());
    await flush();
    trainer.dispose();

    const recovered = make();

    cleanups.push(() => recovered.dispose());
    expect(() => recovered.start(request({ xml: '<mujoco changed="true"/>' }))).toThrow(/changed/);
  });

  it('retains policies for replay, ignores remote readiness and reports process failures', async () => {
    const { trainer, service, events } = fixture();

    service.poll.mockImplementationOnce(async (entry) => {
      fs.writeFileSync(path.join(entry.dir, 'policy.json'), '{"policy":true}');

      return { state: 'done', events: [{ type: 'done', steps: 12, eval: { ready: true } }], stderr: '', code: 0 };
    });

    const started = trainer.start(request());

    await flush();
    expect(events.at(-1)).toMatchObject({ kind: 'done', record: { trainedSteps: 12 } });
    expect(events.at(-1).eval).toBeUndefined();
    trainer.deletePolicy(started.jobId);
    expect(trainer.getPolicy(started.jobId)).toEqual({ policy: true });
    service.poll.mockResolvedValueOnce({ state: 'failed', events: [], stderr: 'forge failed', code: 1 });
    trainer.start(request({ recoveryKey: 'next:0' }));
    await flush();
    expect(events.at(-1)).toMatchObject({ kind: 'error', message: 'forge failed' });
  });
});
