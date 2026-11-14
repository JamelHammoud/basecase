import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkCredentials } from './networkCredentials.mjs';
import { robotId } from './networkIdentity.mjs';

const KEY = 'ab'.repeat(32);
const ENDPOINT = { host: 'robot.local', port: 7447 };
const folders = [];

function credentials() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-robot-identities-'));

  folders.push(folder);

  return new NetworkCredentials(folder);
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

describe('robot credentials', () => {
  it('pins the known SHA256 identity vector and persists private keys separately from endpoint aliases', () => {
    expect(robotId('00'.repeat(32))).toBe('66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925');

    const store = credentials();
    const address = [192, 168, 1, 20].join('.');
    const id = robotId(KEY);

    store.save(ENDPOINT, KEY, address);

    const reopened = new NetworkCredentials(store.folder);

    expect(reopened.read(ENDPOINT)).toBe(KEY);
    expect(reopened.read({ host: address, port: ENDPOINT.port })).toBe(KEY);
    expect(reopened.read({ host: [192, 168, 1, 99].join('.'), port: 7448, id })).toBe(KEY);
    expect(fs.readFileSync(store.file(ENDPOINT), 'utf8')).not.toContain(KEY);

    if (process.platform !== 'win32') expect(fs.statSync(store.identityFile(id)).mode & 0o777).toBe(0o600);
  });

  it('rejects mismatched identities and key files before opening a connection', () => {
    const store = credentials();
    const id = robotId(KEY);
    const other = robotId('cd'.repeat(32));

    expect(() => store.save({ ...ENDPOINT, id: other }, KEY)).toThrow('pairing code');
    store.save(ENDPOINT, KEY);
    expect(store.read({ ...ENDPOINT, id: other })).toBeNull();
    fs.writeFileSync(store.identityFile(id), JSON.stringify({ id, key: 'cd'.repeat(32) }));
    expect(new NetworkCredentials(store.folder).read({ ...ENDPOINT, id })).toBeNull();
    expect(new NetworkCredentials(store.folder).read({ ...ENDPOINT, id: '../escape' })).toBeNull();
  });

  it('leaves memory empty when the private identity file cannot be written', () => {
    const store = credentials();

    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => store.save(ENDPOINT, KEY)).toThrow('disk full');
    expect(store.read(ENDPOINT)).toBeNull();
    expect(store.read({ ...ENDPOINT, id: robotId(KEY) })).toBeNull();
    expect(new NetworkCredentials(store.folder).read({ ...ENDPOINT, id: robotId(KEY) })).toBeNull();
  });
});
