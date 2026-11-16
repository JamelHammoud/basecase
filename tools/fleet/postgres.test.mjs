import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { postgresFixture } from './postgres.mjs';

const { postgresCommand, readdir } = vi.hoisted(() => ({ postgresCommand: vi.fn(), readdir: vi.fn() }));

vi.mock('./postgresCommand.mjs', () => ({ postgresCommand }));
vi.mock('node:fs/promises', async (original) => ({ ...(await original()), readdir }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it('starts and stops an isolated Windows cluster with command logs outside its data directory', async () => {
  const installation = path.join(os.tmpdir(), 'postgres-installation');

  vi.stubGlobal('process', { ...process, platform: 'win32' });
  vi.stubEnv('ProgramFiles', installation);
  vi.stubEnv('FLEET_TEST_DATABASE_URL', '');
  readdir.mockResolvedValue(['16', '17']);

  const fixture = await postgresFixture();

  try {
    const [command, args, log] = postgresCommand.mock.calls[0];
    const directory = path.dirname(log);
    const data = path.join(directory, 'data');
    const bin = path.join(installation, 'PostgreSQL', '17', 'bin');
    const port = new URL(fixture.url).port;

    expect(command).toBe(path.join(bin, 'initdb.exe'));
    expect(args).toEqual(['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
    expect(log).toBe(path.join(directory, 'commands.log'));
    expect(postgresCommand.mock.calls[1]).toEqual([
      path.join(bin, 'pg_ctl.exe'),
      ['-D', data, '-l', path.join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'],
      log,
    ]);
  } finally {
    await fixture.close();
  }

  const [command, args, log] = postgresCommand.mock.calls[2];

  expect(path.basename(command)).toBe('pg_ctl.exe');
  expect(args).toEqual(['-D', path.join(path.dirname(log), 'data'), '-m', 'immediate', '-w', 'stop']);
  await expect(access(path.dirname(log))).rejects.toThrow();
});
