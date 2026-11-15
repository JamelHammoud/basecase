import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnVisionTrainer } from './index.mjs';

const directories = [];

afterEach(() => {
  directories.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-vision-trainer-'));
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
  const spawnProcess = vi.fn(() => child);
  const onEvent = vi.fn();

  directories.push(dir);

  return { dir, child, spawnProcess, onEvent, envDir: path.join(dir, 'env'), uv: 'uv' };
}

describe('local vision process', () => {
  it('uses the isolated frozen project without a shell and forwards bounded JSON events', async () => {
    const options = fixture();
    const handle = spawnVisionTrainer(options);
    const [, args, spawnOptions] = options.spawnProcess.mock.calls[0];

    expect(args).toContain('--frozen');
    expect(args).toContain('--exact');
    expect(spawnOptions.shell).toBeUndefined();
    expect(spawnOptions.env.UV_PROJECT_ENVIRONMENT).toBe(options.envDir);
    expect(spawnOptions.env.YOLO_OFFLINE).toBe('true');
    options.child.stdout.write('noise\n{"type":"progress","epoch":');
    options.child.stdout.write('1}\n');
    options.child.stdout.write(`{"type":"done","padding":"${'x'.repeat(70_000)}"}\n`);
    options.child.stdout.write('{"type":"done","stopped":false}\n');
    options.child.emit('close', 0);
    await expect(handle.done).resolves.toEqual({ code: 0 });
    expect(options.onEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'progress', epoch: 1 },
      { type: 'done', stopped: false },
    ]);
  });

  it('writes a stop file and waits for the child to finish saving', async () => {
    const options = fixture();
    const handle = spawnVisionTrainer(options);
    let stopped = false;
    const stopping = handle.stop().then(() => {
      stopped = true;
    });

    expect(fs.existsSync(path.join(options.dir, 'stop'))).toBe(true);
    await Promise.resolve();
    expect(stopped).toBe(false);
    options.child.emit('close', 0);
    await stopping;
    expect(stopped).toBe(true);
  });

  it('preserves the checked trainer error when dependency warnings reached stderr', async () => {
    const options = fixture();
    const handle = spawnVisionTrainer(options);

    options.child.stdout.write('{"type":"error","message":"Check the training labels."}\n');
    options.child.stderr.write('Unrelated dependency warning');
    options.child.emit('close', 1);
    await expect(handle.done).resolves.toEqual({ code: 1 });
    expect(options.onEvent).toHaveBeenCalledExactlyOnceWith({ type: 'error', message: 'Check the training labels.' });
  });

  it('reports a process spawn failure', async () => {
    const options = fixture();
    const handle = spawnVisionTrainer(options);

    options.child.emit('error', new Error('Python could not start'));
    await expect(handle.done).resolves.toEqual({ code: null });
    expect(options.onEvent).toHaveBeenCalledWith({ type: 'error', message: 'Python could not start' });
  });
});
