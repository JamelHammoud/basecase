import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stageImages } from './stage.mjs';

const jpeg = Uint8Array.from([255, 216, 255, 217]);
const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = () => ({
  'basecase/frames.json': new TextEncoder().encode('{}'),
  'images/train/frame.jpg': jpeg,
  'depth/frame.f32': new Uint8Array(4),
});
let libraryDir;
let imagesDir;

beforeEach(async () => {
  libraryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-stage-'));
  imagesDir = path.join(libraryDir, 'vision-training', 'jobs', 'job-1', 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(path.join(libraryDir, 'datasets', 'content'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(libraryDir, { recursive: true, force: true });
});

async function ref(bytes, packed = true) {
  const content = hashOf(bytes);

  await fs.writeFile(path.join(libraryDir, 'datasets', 'content', content), bytes);

  return { id: content, content, packed };
}

const stage = (images) => stageImages({ libraryDir, id: 'job-1', images });

function changedCentralSize(bytes, size) {
  const copy = Uint8Array.from(bytes);
  const view = new DataView(copy.buffer);
  const index = copy.findIndex((_, i) => view.getUint32(i, true) === 0x02014b50);

  view.setUint32(index + 24, size, true);

  return copy;
}

describe('worker image staging', () => {
  it('extracts one verified frozen JPEG and returns only counts', async () => {
    const image = await ref(zipSync(files(), { level: 0 }));

    expect(await stage([image])).toEqual({ images: 1, bytes: 4 });
    expect(await fs.readFile(path.join(imagesDir, `${image.id}.jpg`))).toEqual(Buffer.from(jpeg));
  });

  it('stages verified raw content through the same worker', async () => {
    const image = await ref(jpeg, false);

    expect(await stage([image])).toEqual({ images: 1, bytes: 4 });
  });

  it('refuses traversal, extra entries, duplicate JPEGs and absent JPEGs', async () => {
    for (const archive of [
      { ...files(), '../outside': jpeg },
      { ...files(), 'images/test/second.jpg': jpeg },
      { 'basecase/frames.json': new Uint8Array(), 'depth/frame.f32': new Uint8Array() },
    ]) {
      await expect(stage([await ref(zipSync(archive, { level: 0 }))])).rejects.toThrow();
    }

    expect(await fs.readdir(imagesDir)).toEqual([]);
  });

  it('refuses mismatched stored sizes, declared expanded bombs and compressed snapshots before extraction', async () => {
    const zip = zipSync(files(), { level: 0 });

    await expect(stage([await ref(changedCentralSize(zip, 192_000_001))])).rejects.toThrow('limit');
    await expect(stage([await ref(changedCentralSize(zip, 1))])).rejects.toThrow('stored');
    await expect(stage([await ref(zipSync(files(), { level: 9 }))])).rejects.toThrow('stored');
    expect(await fs.readdir(imagesDir)).toEqual([]);
  });

  it('refuses corrupt content hashes', async () => {
    const image = await ref(zipSync(files(), { level: 0 }));
    const file = path.join(libraryDir, 'datasets', 'content', image.content);

    await fs.writeFile(file, 'changed');
    await expect(stage([image])).rejects.toThrow('hash');
  });

  it('refuses linked destination directories', async () => {
    const image = await ref(zipSync(files(), { level: 0 }));

    await fs.rm(imagesDir, { recursive: true });
    await fs.symlink(path.join(libraryDir, 'datasets'), imagesDir, 'junction');
    await expect(stage([image])).rejects.toThrow('directory');
  });

  it('refuses malformed bindings and oversized archives without launching a trainer', async () => {
    const image = await ref(zipSync(files(), { level: 0 }));

    await expect(stage([{ ...image, id: '../outside' }])).rejects.toThrow();
    await expect(stage([{ ...image, id: 'a'.repeat(64) }])).rejects.toThrow();

    const file = await fs.open(path.join(libraryDir, 'datasets', 'content', image.content), 'r+');

    await file.truncate(192_000_001);
    await file.close();
    await expect(stage([image])).rejects.toThrow('large');
  });
});
