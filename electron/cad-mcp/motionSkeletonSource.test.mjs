import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MOTION_BYTES, motionSkeletonSource } from './motionSkeletonSource.mjs';

const folders = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-source-'));
  const folder = path.join(root, 'evidence');

  folders.push(root);
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'wave.bvh'), 'HIERARCHY');
  await fs.writeFile(path.join(root, 'secret.bvh'), 'outside evidence');

  return { root, folder };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

describe('motion skeleton BVH source', () => {
  it('reads an attached clip', async () => {
    const { folder } = await fixture();

    expect(await motionSkeletonSource({ file: 'wave.bvh' }, { folder })).toBe('HIERARCHY');
  });

  it('refuses traversal and symlinks outside the evidence folder', async () => {
    const { root, folder } = await fixture();

    await fs.symlink(path.join(root, 'secret.bvh'), path.join(folder, 'linked.bvh'));
    await expect(motionSkeletonSource({ file: '../secret.bvh' }, { folder })).rejects.toThrow('attached');
    await expect(motionSkeletonSource({ file: 'linked.bvh' }, { folder })).rejects.toThrow('attached');
  });

  it('refuses oversized attached files and downloaded bodies', async () => {
    const { folder } = await fixture();
    const handle = await fs.open(path.join(folder, 'large.bvh'), 'w');

    await handle.truncate(MAX_MOTION_BYTES + 1);
    await handle.close();

    const stream = vi.spyOn(nodeFs, 'createReadStream');

    await expect(motionSkeletonSource({ file: 'large.bvh' }, { folder })).rejects.toThrow('larger');
    expect(stream.mock.results[0].value.destroyed).toBe(true);
    await expect(
      motionSkeletonSource(
        { url: 'https://example.com/wave.bvh' },
        {
          fetch: async () => new Response('x', { headers: { 'content-length': String(MAX_MOTION_BYTES + 1) } }),
        },
      ),
    ).rejects.toThrow('larger');
  });

  it.each(['http://127.0.0.1/wave.bvh', 'http://169.254.169.254/wave.bvh', 'file:///wave.bvh'])(
    'refuses a private or local URL: %s',
    async (url) => await expect(motionSkeletonSource({ url })).rejects.toThrow('public'),
  );

  it('reads public downloads and checks HTTP failures', async () => {
    expect(
      await motionSkeletonSource(
        { url: 'https://example.com/wave.bvh' },
        { fetch: async () => new Response('HIERARCHY') },
      ),
    ).toBe('HIERARCHY');
    await expect(
      motionSkeletonSource(
        { url: 'https://example.com/wave.bvh' },
        { fetch: async () => new Response('', { status: 404 }) },
      ),
    ).rejects.toThrow('404');
  });

  it('stops a streamed download when its body exceeds the cap without a declared length', async () => {
    let reads = 0;
    const body = {
      async *[Symbol.asyncIterator]() {
        reads++;

        yield new Uint8Array(MAX_MOTION_BYTES);

        reads++;

        yield new Uint8Array(1);

        reads++;

        yield new Uint8Array(1);
      },
    };

    await expect(
      motionSkeletonSource(
        { url: 'https://example.com/wave.bvh' },
        { fetch: async () => ({ ok: true, headers: new Headers(), body }) },
      ),
    ).rejects.toThrow('larger');
    expect(reads).toBe(2);
  });
});
