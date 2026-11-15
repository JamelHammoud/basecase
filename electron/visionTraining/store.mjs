import fs from 'node:fs/promises';
import path from 'node:path';
import { checkedFileId, isSafeFileId } from '../backend/constants.mjs';
import { checkedStart, checkedRun, MAX_JOB_BYTES, MAX_RUN_BYTES, plain } from './validation.mjs';
import { directory, hashOf, immutableFile, readFile, saveContent, writeJob } from './files.mjs';
import { stageImages } from './stage.mjs';

const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const launchTrainer = async (options) => (await import('../visionTrainer/index.mjs')).spawnVisionTrainer(options);

export class VisionTrainingStore {
  constructor({ libraryDir, launch = launchTrainer, stage = stageImages }) {
    this.libraryDir = libraryDir;
    this.launch = launch;
    this.stage = stage;
    this.active = new Map();
    this.pending = new Set();
    this.queue = Promise.resolve();
    this.closed = false;
  }

  async root() {
    await directory(this.libraryDir, false);

    return directory(path.join(this.libraryDir, 'vision-training'));
  }

  async jobDir(id, create = false) {
    checkedFileId(id);

    const jobs = await directory(path.join(await this.root(), 'jobs'));

    return directory(path.join(jobs, id), create);
  }

  async start(payload) {
    const checked = checkedStart(payload);
    const next = this.queue.then(() => this.begin(checked));

    this.queue = next.catch(() => {});

    return next;
  }

  checkAvailable(id) {
    if (this.closed) throw new Error('Vision training has stopped');

    const busy = [...this.active.entries()].some(
      ([other, record]) => other !== id && ['starting', 'running', 'stopping'].includes(record.status.state),
    );

    if (busy) throw new Error('A vision trainer is running. Stop it before starting another.');
  }

  async begin({ id, job, refs, json, resume }) {
    this.checkAvailable(id);

    const dir = await this.jobDir(id, true);
    const binding = Buffer.from(JSON.stringify({ job, images: [...refs] }));
    const bindingFile = path.join(dir, 'binding.json');
    let existing = false;

    try {
      const previous = await readFile(bindingFile, MAX_JOB_BYTES + 2 * 1024 * 1024);

      existing = true;

      if (!previous.equals(binding)) throw new Error('The resumed training job must match its saved inputs');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const active = this.active.get(id);

    if (active && ['starting', 'running', 'stopping'].includes(active.status.state)) return { ...active.status };

    if (existing && !resume) throw new Error('Resume the saved training job');

    const record = {
      status: { id, state: 'starting', jobHash: hashOf(binding) },
      handle: null,
      stop: false,
      controller: new AbortController(),
    };

    this.active.set(id, record);

    try {
      await directory(path.join(dir, 'images'));
      await this.stage(
        { libraryDir: this.libraryDir, id, images: [...refs.values()] },
        { signal: record.controller.signal },
      );
      await immutableFile(bindingFile, binding);
      await immutableFile(path.join(dir, 'spec.json'), Buffer.from(json));

      await this.prepareRuntime({ dir, job, existing, resume });

      this.checkAvailable(id);

      const task = this.run(dir, record);

      this.pending.add(task);
      task.finally(() => this.pending.delete(task));

      return { ...record.status };
    } catch (error) {
      record.status.state = record.stop ? 'stopped' : 'failed';
      record.status.error = error instanceof Error ? error.message : 'Couldn’t prepare training. Start training again.';

      throw error;
    }
  }

  async prepareRuntime({ dir, job, existing, resume }) {
    const actualResume = existing && resume && (await this.hasCheckpoint(dir));

    await writeJob(dir, { ...job, resume: actualResume });
    await fs.rm(path.join(dir, 'stop'), { force: true });
  }

  async hasCheckpoint(dir) {
    try {
      const stat = await fs.lstat(path.join(dir, 'checkpoint.pt'));

      if (!stat.isFile()) throw new Error('Training needs a regular checkpoint file');

      if (stat.size > MAX_ARTIFACT_BYTES) throw new Error('The training checkpoint is too large');

      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;

      return false;
    }
  }

  async run(dir, record) {
    try {
      const envDir = await directory(path.join(await this.root(), 'environment'));

      if (record.stop) {
        record.status.state = 'stopped';

        return;
      }

      record.handle = await this.launch({ dir, envDir, onEvent: (event) => this.event(record, event) });
      record.status.state = record.stop ? 'stopping' : 'running';

      if (record.stop) await record.handle.stop();

      const result = await record.handle.done;

      if (!['complete', 'stopped', 'failed'].includes(record.status.state))
        record.status.state = record.terminal ?? (result.code === 0 ? 'complete' : 'failed');
    } catch (error) {
      record.status.state = 'failed';
      record.status.error = error instanceof Error ? error.message : 'Training failed';
    } finally {
      record.handle = null;
    }
  }

  event(record, event) {
    if (!plain(event) || Buffer.byteLength(JSON.stringify(event)) > 64 * 1024) return;

    if (event.type === 'progress') record.status.progress = event;

    if (event.type === 'done') record.terminal = event.stopped ? 'stopped' : 'complete';

    if (event.type === 'error') {
      record.terminal = 'failed';
      record.status.error = typeof event.message === 'string' ? event.message.slice(0, 2000) : 'Training failed';
    }
  }

  async status(id) {
    checkedFileId(id);

    const active = this.active.get(id);

    if (active) return { ...active.status };

    try {
      const dir = await this.jobDir(id);
      const result = JSON.parse(await readFile(path.join(dir, 'result.json'), MAX_RUN_BYTES));

      return { id, state: result.stopped ? 'stopped' : 'complete', progress: result };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;

      return null;
    }
  }

  async stop(id) {
    checkedFileId(id);

    const record = this.active.get(id);

    if (!record || ['complete', 'stopped', 'failed'].includes(record.status.state)) return this.status(id);

    record.stop = true;
    record.status.state = 'stopping';

    if (!record.handle) record.controller.abort();

    Promise.resolve(record.handle?.stop()).catch((error) => {
      record.status.error = error.message;
    });

    return { ...record.status };
  }

  async artifact(id) {
    checkedFileId(id);

    const active = this.active.get(id);

    if (active && !['complete', 'stopped'].includes(active.status.state))
      throw new Error('Wait for training to finish');

    const dir = await this.jobDir(checkedFileId(id));
    const result = JSON.parse(await readFile(path.join(dir, 'result.json'), MAX_RUN_BYTES));
    const checkpoint = await this.keep(dir, 'checkpoint.pt');

    if (result.stopped) return { checkpoint: checkpoint.sha256, epoch: result.epoch, stopped: true };

    const model = await this.keep(dir, 'model.onnx');
    const baseline = await this.keep(dir, 'baseline.onnx');
    const predictions = await this.keep(dir, 'predictions.json');

    return {
      model,
      baseline,
      predictions,
      checkpoint: checkpoint.sha256,
      input: result.input,
      adapter: result.adapter,
      parity: result.parity,
      epoch: result.epoch,
    };
  }

  async keep(dir, name) {
    const bytes = await readFile(path.join(dir, name), MAX_ARTIFACT_BYTES);

    return saveContent(this.libraryDir, bytes);
  }

  async saveRun(run) {
    const json = checkedRun(run);
    const root = await this.root();
    const records = await directory(path.join(root, 'runs'));
    const dir = await directory(path.join(records, checkedFileId(run.datasetId)));

    await immutableFile(path.join(dir, `${checkedFileId(run.id)}.json`), Buffer.from(json));

    return JSON.parse(json);
  }

  async runs(datasetId) {
    checkedFileId(datasetId);

    try {
      const records = await directory(path.join(await this.root(), 'runs'), false);
      const dir = await directory(path.join(records, datasetId), false);
      const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json') && isSafeFileId(name.slice(0, -5)));

      if (names.length > 10_000) throw new Error('Too many training runs');

      const runs = [];
      let total = 0;

      for (const name of names) {
        const bytes = await readFile(path.join(dir, name), MAX_RUN_BYTES);

        total += bytes.length;

        if (total > 64 * 1024 * 1024) throw new Error('The saved training runs are too large');

        const run = JSON.parse(bytes);

        checkedRun(run);

        if (run.datasetId !== datasetId || `${run.id}.json` !== name)
          throw new Error('The training run does not match its file');

        runs.push(run);
      }

      return runs;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;

      return [];
    }
  }

  async dispose() {
    this.closed = true;

    await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
    await this.queue;
    await this.settled();
  }

  settled() {
    return Promise.all([...this.pending]);
  }
}
