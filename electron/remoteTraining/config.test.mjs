import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkedComputer, runSsh, sshArguments } from './config.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, execFile: vi.fn(actual.execFile) };
});

const dirs = [];
const hostKey = `ssh-ed25519 ${Buffer.alloc(32, 1).toString('base64')}`;

function computer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'training-config-'));

  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'identity with spaces'), 'fixture');

  return { host: 'training.example', user: 'trainer', key: path.join(dir, 'identity with spaces'), hostKey };
}

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('training SSH boundary', () => {
  it.each([
    ['Connection reset by peer', true],
    ['Host key verification failed.', false],
  ])('classifies an interrupted upload from the SSH exit: %s', async (message, reconnect) => {
    vi.mocked(execFile).mockImplementationOnce((_file, _args, _options, callback) => {
      const stdin = new EventEmitter();

      stdin.end = () => {
        stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
        callback(Object.assign(new Error('SSH failed'), { code: 255 }), '', message);
      };

      return { stdin };
    });
    await expect(runSsh({ args: [], input: 'job inputs' })).rejects.toMatchObject({ message, reconnect });
  });

  it('spawns the installed OpenSSH client without a shell on this platform', async () => {
    await expect(runSsh({ args: ['-V'], input: '' })).resolves.toBe('');
  });

  it('pins the explicit host key, bypasses config and passes paths as one argument', () => {
    const config = checkedComputer(computer());
    const args = sshArguments(config, 'known hosts');

    expect(args).toContain('StrictHostKeyChecking=yes');
    expect(args).toContain('GlobalKnownHostsFile=none');
    expect(args).toContain('ProxyCommand=none');
    expect(args).toContain('UserKnownHostsFile="known hosts"');
    expect(args.slice(-3)).toEqual(['--', config.host, 'sh -s']);
    expect(args).toContain(config.key);
    expect(checkedComputer({ ...computer(), hostKey: `${hostKey} fixture@computer` }).hostKey).toBe(hostKey);
  });

  it.each(['-oProxyCommand=touch bad', 'host;touch bad', 'host\nHost *', '../host', 'host$(id)', 'user@host'])(
    'refuses hostile host %s',
    (host) => expect(() => checkedComputer({ ...computer(), host })).toThrow(),
  );

  it.each(['root;id', '-oProxyCommand=id', 'user\nroot'])('refuses hostile user %s', (user) => {
    expect(() => checkedComputer({ ...computer(), user })).toThrow();
  });

  it('refuses missing identities and unverified fingerprints', () => {
    expect(() => checkedComputer({ ...computer(), key: '/missing/identity' })).toThrow();
    expect(() => checkedComputer({ ...computer(), hostKey: 'SHA256:unverified' })).toThrow();
    expect(() => checkedComputer({ ...computer(), hostKey: `${hostKey}\nhost ssh-rsa evil` })).toThrow();
  });
});
