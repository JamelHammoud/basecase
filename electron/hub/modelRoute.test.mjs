import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_PREFIX, modelResponse } from './modelRoute.mjs';

const dirs = [];
const hash = 'a'.repeat(64);
const request = (suffix, method = 'GET') => new Request(`https://app.example${MODEL_PREFIX}${suffix}`, { method });

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-route-'));

  dirs.push(dir);
  await fs.mkdir(path.join(dir, 'models'));
  await fs.writeFile(path.join(dir, 'models', `${hash}.onnx`), new Uint8Array([8, 1]));

  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('model binary route', () => {
  it('serves cached binary bytes by a hash with no local path in the reply', async () => {
    const dir = await fixture();
    const response = await modelResponse(request(hash), dir);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([8, 1]));
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('refuses traversal, escaped paths, unknown hashes and writes', async () => {
    const dir = await fixture();

    for (const suffix of ['../secret', '%2e%2e%2fsecret', `${hash}/x`, 'b'.repeat(64)])
      expect((await modelResponse(request(suffix), dir)).status).toBe(404);

    expect((await modelResponse(request(hash, 'POST'), dir)).status).toBe(404);
    expect((await modelResponse(new Request(`app://other${MODEL_PREFIX}${hash}`), dir)).status).toBe(404);
  });

  it('refuses symbolic-link cache folders on every platform', async () => {
    const dir = await fixture();
    const folder = path.join(dir, 'models');
    const elsewhere = path.join(dir, 'elsewhere');

    await fs.rename(folder, elsewhere);
    await fs.symlink(elsewhere, folder, 'junction');
    expect((await modelResponse(request(hash), dir)).status).toBe(404);
  });

  it.skipIf(process.platform === 'win32')('refuses symbolic-link files', async () => {
    const dir = await fixture();

    await fs.rm(path.join(dir, 'models', `${hash}.onnx`));
    await fs.writeFile(path.join(dir, 'secret'), 'secret');
    await fs.symlink(path.join(dir, 'secret'), path.join(dir, 'models', `${hash}.onnx`));
    expect((await modelResponse(request(hash), dir)).status).toBe(404);
  });
});
