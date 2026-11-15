import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisionTrainingStore } from './store.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = Buffer.from([255, 216, 255, 217]);
const content = hash(bytes);
const sampleId = 'a'.repeat(64);
const job = () => ({
  version: 1,
  kind: 'detect',
  classes: [{ id: 0, name: 'Cup' }],
  seed: 1,
  epochs: 10,
  batch: 4,
  imageSize: 128,
  device: 'auto',
  samples: ['train', 'validation', 'test'].map((split, index) => ({
    id: ['a', 'b', 'c'][index].repeat(64),
    split,
    image: `images/${['a', 'b', 'c'][index].repeat(64)}.jpg`,
    width: 2,
    height: 2,
    annotations: [],
  })),
});
let root;
let store;
let launch;
let finish;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-training-'));
  await fs.mkdir(path.join(root, 'datasets', 'content'), { recursive: true });
  await fs.writeFile(path.join(root, 'datasets', 'content', content), bytes);
  launch = vi.fn(async () => ({
    stop: vi.fn(),
    done: new Promise((resolve) => {
      finish = resolve;
    }),
  }));
  store = new VisionTrainingStore({ libraryDir: root, launch });
});

afterEach(async () => {
  finish?.({ code: 1 });
  await store.settled();
  await fs.rm(root, { recursive: true, force: true });
});

const payload = () => ({
  id: 'run-1',
  job: job(),
  images: job().samples.map((sample) => ({ id: sample.id, content })),
});

describe('vision training protected files', () => {
  it('refuses hostile ids and caller paths before creating a job', async () => {
    for (const id of ['../auth', 'a/b', 'a\\b', 'CON', '', 7])
      await expect(store.start({ ...payload(), id })).rejects.toThrow();

    await expect(
      store.start({
        ...payload(),
        job: { ...job(), samples: [{ ...job().samples[0], image: '../auth' }, ...job().samples.slice(1)] },
      }),
    ).rejects.toThrow();
    await expect(store.start({ ...payload(), images: [{ id: sampleId, content: '../auth' }] })).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
    await expect(fs.access(path.join(root, 'vision-training'))).rejects.toThrow();
  });

  it('refuses changed content, missing image bindings and oversized source files', async () => {
    await fs.writeFile(path.join(root, 'datasets', 'content', content), 'changed');
    await expect(store.start(payload())).rejects.toThrow('hash');
    await expect(store.start({ ...payload(), images: [] })).rejects.toThrow();

    const file = await fs.open(path.join(root, 'datasets', 'content', content), 'w');

    await file.truncate(64 * 1024 * 1024 + 1);
    await file.close();
    await expect(store.start(payload())).rejects.toThrow('large');
    expect(launch).not.toHaveBeenCalled();
  });

  it('refuses linked training directories', async () => {
    const outside = path.join(root, 'outside');

    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(root, 'vision-training'), 'junction');
    await expect(store.start(payload())).rejects.toThrow('directory');
    expect(launch).not.toHaveBeenCalled();
  });

  it('stages only verified content and resumes only an identical job', async () => {
    const result = await store.start({ ...payload(), resume: true });

    expect(result.state).toBe('starting');
    await vi.waitFor(async () => expect(await store.status('run-1')).toMatchObject({ state: 'running' }));
    expect(launch).toHaveBeenCalledOnce();

    const initial = JSON.parse(await fs.readFile(path.join(root, 'vision-training', 'jobs', 'run-1', 'job.json')));

    expect(initial.resume).toBe(false);
    expect(await fs.readFile(path.join(root, 'vision-training', 'jobs', 'run-1', 'images', `${sampleId}.jpg`))).toEqual(
      bytes,
    );
    expect(await store.status('run-1')).toMatchObject({ id: 'run-1', state: 'running' });
    await expect(store.start({ ...payload(), job: { ...job(), seed: 2 }, resume: true })).rejects.toThrow('match');
    await store.stop('run-1');
    expect(await store.status('run-1')).toMatchObject({ state: 'stopping' });
    await fs.writeFile(path.join(root, 'vision-training', 'jobs', 'run-1', 'checkpoint.pt'), 'trusted checkpoint');
    launch.mock.calls[0][0].onEvent({ type: 'done', stopped: true });
    finish({ code: 0 });
    await store.settled();
    await store.start({ ...payload(), resume: true });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(2));

    const resumed = JSON.parse(await fs.readFile(path.join(root, 'vision-training', 'jobs', 'run-1', 'job.json')));

    expect(resumed.resume).toBe(true);
  });

  it('imports only fixed bounded artifacts after the child exits', async () => {
    await store.start(payload());
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());

    const dir = path.join(root, 'vision-training', 'jobs', 'run-1');
    const result = {
      type: 'done',
      stopped: false,
      epoch: 10,
      input: { width: 128, height: 128 },
      adapter: 'generic',
      parity: { maxAbsoluteError: 0, tolerance: 0.001 },
    };

    for (const name of ['model.onnx', 'baseline.onnx', 'checkpoint.pt', 'predictions.json'])
      await fs.writeFile(path.join(dir, name), name);

    await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(result));
    launch.mock.calls[0][0].onEvent(result);
    await expect(store.artifact('run-1')).rejects.toThrow('finish');
    finish({ code: 0 });
    await store.settled();

    const artifact = await store.artifact('run-1');

    expect(artifact.model).toEqual({ sha256: hash('model.onnx'), bytes: 10 });
    expect(artifact.baseline.sha256).toBe(hash('baseline.onnx'));
    expect(artifact.checkpoint).toBe(hash('checkpoint.pt'));
    expect(artifact.predictions.sha256).toBe(hash('predictions.json'));
    expect(await fs.readFile(path.join(root, 'datasets', 'content', artifact.model.sha256), 'utf8')).toBe('model.onnx');
    await fs.unlink(path.join(dir, 'model.onnx'));
    await fs.symlink(path.join(root, 'datasets'), path.join(dir, 'model.onnx'), 'junction');
    await expect(store.artifact('run-1')).rejects.toThrow('file');
  });

  it('refuses a second running trainer', async () => {
    await store.start(payload());
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    launch.mock.calls[0][0].onEvent({ type: 'error', message: 'Training failed' });
    await expect(store.start({ ...payload(), id: 'run-2' })).rejects.toThrow('running');
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('releases the trainer slot when saving the staged job fails', async () => {
    const dir = path.join(root, 'vision-training', 'jobs', 'run-1');

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.json'), 'conflicting saved spec');
    await expect(store.start(payload())).rejects.toThrow('immutable');
    expect(await store.status('run-1')).toMatchObject({ state: 'failed', error: expect.stringContaining('immutable') });
    expect(launch).not.toHaveBeenCalled();
    await store.start({ ...payload(), id: 'run-2' });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    expect(await store.status('run-2')).toMatchObject({ state: 'running' });
  });

  it('requests checkpointed shutdown for the running child', async () => {
    await store.start(payload());
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());

    const disposing = store.dispose();

    expect(await store.status('run-1')).toMatchObject({ state: 'stopping' });
    launch.mock.calls[0][0].onEvent({ type: 'done', stopped: true });
    finish({ code: 0 });
    await disposing;
    expect(await store.status('run-1')).toMatchObject({ state: 'stopped' });
  });
});

describe('saved vision training runs', () => {
  it('keeps run metadata immutable and checks every list id', async () => {
    const run = {
      id: 'record-1',
      datasetId: 'dataset-1',
      datasetVersion: 1,
      jobId: 'run-1',
      status: 'checkpoint',
      version: 1,
      at: '2026-11-15',
    };

    expect(await store.saveRun(run)).toEqual(run);
    expect(await store.saveRun(run)).toEqual(run);
    await expect(store.saveRun({ ...run, at: 'changed' })).rejects.toThrow('immutable');
    expect(await store.runs('dataset-1')).toEqual([run]);
    await expect(store.runs('../auth')).rejects.toThrow();
  });
});

describe('training splits without a test set', () => {
  it('launches two samples split between train and validation', async () => {
    const samples = job().samples.slice(0, 2);
    const images = payload().images.slice(0, 2);

    await store.start({ ...payload(), job: { ...job(), samples }, images });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());

    const saved = JSON.parse(await fs.readFile(path.join(root, 'vision-training', 'jobs', 'run-1', 'job.json')));

    expect(saved.samples.map((sample) => sample.split)).toEqual(['train', 'validation']);
    expect(await store.status('run-1')).toMatchObject({ state: 'running' });
  });

  it('requires both train and validation when test images are absent', async () => {
    for (const split of ['train', 'validation']) {
      const samples = job()
        .samples.slice(0, 2)
        .map((sample) => ({ ...sample, split }));
      const images = payload().images.slice(0, 2);

      await expect(store.start({ ...payload(), job: { ...job(), samples }, images })).rejects.toThrow();
    }

    expect(launch).not.toHaveBeenCalled();
  });
});
