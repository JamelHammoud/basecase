import { EventEmitter } from 'node:events';
import { writeSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postgresCommand } from './postgresCommand.mjs';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn }));

const directories = [];

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function commandLog() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'postgres-command-'));

  directories.push(directory);

  return path.join(directory, 'command.log');
}

describe('native PostgreSQL command ownership', () => {
  it('finishes on command exit without waiting for descendant handles to close', async () => {
    const child = new EventEmitter();
    const log = await commandLog();

    spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit('exit', 0));

      return child;
    });
    await postgresCommand('pg_ctl.exe', ['start'], log);

    const options = spawn.mock.calls[0][2];

    expect(options.windowsHide).toBe(true);
    expect(options.stdio[0]).toBe('ignore');
    expect(typeof options.stdio[1]).toBe('number');
    expect(options.stdio[2]).toBe(options.stdio[1]);
    expect(await readFile(log, 'utf8')).toBe('');
  });

  it.each([1, null])('rejects a command that exits with %s', async (code) => {
    const child = new EventEmitter();

    spawn.mockImplementation((_command, _args, options) => {
      writeSync(options.stdio[2], 'server startup failed\n');
      queueMicrotask(() => child.emit('exit', code));

      return child;
    });
    await expect(postgresCommand('pg_ctl.exe', ['start'], await commandLog())).rejects.toThrow(
      `PostgreSQL command exited ${code}: server startup failed`,
    );
  });

  it('rejects a failed spawn and releases its log', async () => {
    const child = new EventEmitter();
    const error = new Error('Executable missing');

    spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit('error', error));

      return child;
    });
    await expect(postgresCommand('pg_ctl.exe', ['start'], await commandLog())).rejects.toBe(error);
  });
});
