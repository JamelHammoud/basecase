import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteTrainer } from '../remoteTrainer.mjs';

const cleanups = [];
const flush = () => new Promise((resolve) => setImmediate(resolve));
const request = {
  workspaceId: 'skill:scene',
  recoveryKey: 'workflow:0',
  xml: '<mujoco/>',
  job: { name: 'Stand', task: 'stand', minutes: 2, seed: 20, maxIterations: 9 },
};

afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function fixture() {
  const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-group-'));
  const events = [];
  const service = {
    status: () => ({ attempts: 3, concurrency: 2 }),
    selected: () => true,
    descriptors: () => [],
    prepare: vi.fn(async (entry) => ({ ...entry, inputHashes: { 'model.xml': 'frozen' } })),
    dispatch: vi.fn(async () => {}),
    poll: vi.fn(async () => ({ state: 'running', events: [], stderr: '', code: 0 })),
    stop: vi.fn(async () => {}),
    markCompleted: vi.fn(),
  };
  const trainers = [];
  const make = () => {
    const trainer = new RemoteTrainer({ libraryDir, remote: service, emit: (event) => events.push(event) });

    trainers.push(trainer);

    return trainer;
  };
  const trainer = make();

  cleanups.push(() => {
    trainers.forEach((instance) => instance.dispose());
    fs.rmSync(libraryDir, { recursive: true, force: true });
  });

  return { trainer, service, events, make };
}

function succeed(descriptor) {
  fs.writeFileSync(path.join(descriptor.dir, 'policy.json'), '{}');

  return { state: 'done', code: 0, stderr: '', events: [{ type: 'done', steps: 12 }] };
}

async function tick(trainer) {
  const running = trainer.remoteRuns.values().next().value;

  if (!running) return;

  clearTimeout(running.timer);
  await trainer.connect(running);
}

describe('grouped dispatch through the existing workflow queue', () => {
  it('freezes distinct children, bounds concurrency and resumes completed and active children', async () => {
    const state = fixture();
    const { trainer, service } = state;

    trainer.start(request);
    await flush();
    expect(service.prepare).toHaveBeenCalledTimes(3);
    expect(service.dispatch).toHaveBeenCalledTimes(3);
    expect(trainer.remoteEntries[0].children.map((child) => child.slot)).toEqual([0, 1, 0]);

    const entry = trainer.remoteEntries[0];
    const first = entry.children[0].id;

    expect(new Set(entry.children.map((child) => child.id)).size).toBe(3);
    expect(entry.children.map((child) => child.job.seed)).toEqual([20, 21, 22]);
    service.poll.mockImplementation(async (descriptor) =>
      descriptor.id === first ? succeed(descriptor) : { state: 'running', events: [], code: 0 },
    );
    await tick(trainer);
    trainer.dispose();
    service.status = () => ({ attempts: 4, concurrency: 1 });

    const recovered = state.make();

    expect(recovered.start(request).jobId).toBe(entry.id);
    await flush();
    expect(service.dispatch).toHaveBeenCalledTimes(3);
    expect(recovered.remoteEntries[0].concurrency).toBe(2);
    expect(service.poll.mock.calls.filter(([descriptor]) => descriptor.id === first)).toHaveLength(2);
    service.poll.mockImplementation(async (descriptor) => succeed(descriptor));
    await tick(recovered);

    const done = state.events.findLast((event) => event.kind === 'done');

    expect(done.candidates).toHaveLength(3);
    expect(done.candidates.map((child) => child.steps)).toEqual([12, 12, 12]);
    expect(recovered.remoteRuns.size).toBe(0);
    recovered.start(request);
    await flush();
    expect(service.dispatch).toHaveBeenCalledTimes(3);
  });

  it('recovers an uncertain dispatch with the same child identity and stops it while disconnected', async () => {
    const { trainer, service } = fixture();

    service.dispatch.mockRejectedValueOnce(Object.assign(new Error('Lost acknowledgment'), { reconnect: true }));
    trainer.start(request);
    await flush();

    const first = service.dispatch.mock.calls[0][0].id;

    trainer.stop('skill:scene');
    await flush();
    service.poll.mockResolvedValue({ state: 'failed', events: [], code: 125, stderr: 'Stopped' });
    await tick(trainer);
    expect(service.dispatch.mock.calls.filter(([descriptor]) => descriptor.id === first)).toHaveLength(2);
    expect(service.stop.mock.calls.some(([descriptor]) => descriptor.id === first)).toBe(true);
    expect(new Set(service.stop.mock.calls.map(([descriptor]) => descriptor.id)).size).toBe(3);
    expect(trainer.remoteEntries[0].outcome.kind).toBe('error');
  });

  it('cancels a queued group without dispatch and keeps it cancelled across restart', async () => {
    const { trainer, service, make } = fixture();

    const active = trainer.start(request);
    const cancelled = trainer.start({ ...request, workspaceId: 'skill:other', recoveryKey: 'other:0' });

    trainer.stop('skill:other');
    await flush();
    trainer.dispose();

    const directories = fs.readdirSync(trainer.jobsDir);
    const listing = vi
      .spyOn(fs, 'readdirSync')
      .mockReturnValueOnce([cancelled.jobId, ...directories.filter((id) => id !== cancelled.jobId)]);
    const recovered = make();

    listing.mockRestore();
    await flush();
    expect(service.dispatch).toHaveBeenCalledTimes(3);
    expect(recovered.remoteEntries.find((entry) => entry.id === cancelled.jobId).outcome.kind).toBe('error');
    expect(recovered.remoteEntries.find((entry) => entry.id === active.jobId).outcome).toBeUndefined();
  });

  it('returns surviving candidates beside a failed child and records every failure when none survive', async () => {
    for (const allFailed of [false, true]) {
      const { trainer, service, events } = fixture();

      service.poll.mockImplementation(async (descriptor) =>
        allFailed || descriptor.job.seed === 20
          ? { state: 'failed', code: 1, stderr: 'Child failed', events: [] }
          : succeed(descriptor),
      );
      trainer.start(request);
      await flush();
      await tick(trainer);

      const outcome = events.at(-1);

      expect(outcome.kind).toBe(allFailed ? 'error' : 'done');
      expect(outcome.candidates.filter((candidate) => candidate.outcome.kind === 'done')).toHaveLength(
        allFailed ? 0 : 2,
      );
      expect(trainer.remoteEntries[0].children.every((child) => child.outcome)).toBe(true);
    }
  });
});
