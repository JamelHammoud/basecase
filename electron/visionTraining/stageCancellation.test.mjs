import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { VisionTrainingStore } from './store.mjs';
import { stageImages } from './stage.mjs';

let libraryDir;
let store;

afterEach(async () => {
  await store?.dispose();
  await fs.rm(libraryDir, { recursive: true, force: true });
});

it('cancels staging before any trainer starts', async () => {
  libraryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-cancel-stage-'));

  const launch = vi.fn();
  const stage = vi.fn(
    (_payload, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Training stopped')), { once: true }),
      ),
  );

  store = new VisionTrainingStore({ libraryDir, launch, stage });

  const samples = ['train', 'validation', 'test'].map((split, index) => ({
    id: ['a', 'b', 'c'][index].repeat(64),
    split,
    image: `images/${['a', 'b', 'c'][index].repeat(64)}.jpg`,
    width: 1,
    height: 1,
    annotations: [],
  }));
  const started = store.start({
    id: 'run-1',
    job: {
      version: 1,
      kind: 'detect',
      classes: [{ id: 0, name: 'cup' }],
      seed: 1,
      epochs: 10,
      batch: 4,
      imageSize: 128,
      device: 'auto',
      samples,
    },
    images: samples.map(({ id }) => ({ id, content: id, packed: true })),
  });
  const refused = expect(started).rejects.toThrow('stopped');

  await vi.waitFor(() => expect(stage).toHaveBeenCalledOnce());
  await store.stop('run-1');
  await refused;
  expect(launch).not.toHaveBeenCalled();
  expect(await store.status('run-1')).toMatchObject({ state: 'stopped' });
});

it('rejects a cancelled worker request before touching its directories', async () => {
  libraryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-aborted-stage-'));
  await expect(stageImages({ libraryDir, id: 'run-1', images: [] }, { signal: AbortSignal.abort() })).rejects.toThrow(
    'stopped',
  );
  expect(await fs.readdir(libraryDir)).toEqual([]);
});
