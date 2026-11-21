import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { postgresCommand } from './postgresCommand.mjs';

const execute = promisify(execFile);

export async function freePort() {
  const server = net.createServer();

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();

  await new Promise((resolve) => server.close(resolve));

  return port;
}

async function windowsPostgres() {
  const root = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PostgreSQL');
  const versions = (await readdir(root)).sort().reverse();
  const bin = path.join(root, versions[0], 'bin');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'basecase-fleet-pg-'));
  const data = path.join(directory, 'data');
  const port = await freePort();
  const run = (name, args) =>
    postgresCommand(path.join(bin, `${name}.exe`), args, path.join(directory, 'commands.log'));

  await run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
  await run('pg_ctl', [
    '-D',
    data,
    '-l',
    path.join(directory, 'server.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    'start',
  ]);

  return {
    url: `postgres://postgres@127.0.0.1:${port}/postgres`,
    async close() {
      await run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export async function postgresFixture() {
  if (process.env.FLEET_TEST_DATABASE_URL) return { url: process.env.FLEET_TEST_DATABASE_URL, close: async () => {} };

  if (process.platform === 'win32') return windowsPostgres();

  const password = randomBytes(24).toString('hex');
  const { stdout } = await execute('docker', [
    'run',
    '--rm',
    '-d',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    'postgres:18-alpine',
  ]);
  const id = stdout.trim();
  const logs = spawn('docker', ['logs', '--follow', id]);

  await new Promise((resolve, reject) => {
    let output = '';
    const receive = (chunk) => {
      output = (output + String(chunk)).slice(-32768);

      if (/listening on IPv4[\s\S]*database system is ready to accept connections/.test(output)) resolve();
    };

    logs.stdout.on('data', receive);
    logs.stderr.on('data', receive);
    logs.once('error', reject);
    logs.once('exit', (code) => reject(new Error(`PostgreSQL fixture exited ${code}`)));
  });
  logs.kill();

  const ports = await execute('docker', ['port', id, '5432']);
  const port = ports.stdout.trim().split(':').at(-1);

  return {
    url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
    async close() {
      await execute('docker', ['stop', '--time', '0', id]);
    },
  };
}
