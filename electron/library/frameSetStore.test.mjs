import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FrameSetStore, MAX_FRAME_BYTES } from './frameSetStore.mjs';

let dir;
let store;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;

  return JSON.stringify(value);
};
const fixture = () => {
  const content = { format: 'basecase-vision', version: 1, name: 'Cubes', caseId: 'cube-case', seed: 7, classes: [{ id: 1, name: 'Cube', kind: 'box' }], frames: [] };
  const frame = { width: 1, height: 1, image: 'AQID', depth: 'AAAAAA==', annotations: [], camera: {}, seed: 7 };

  content.frames.push({ ...frame, id: hash(canonical(frame)) });

  return { ...content, id: hash(canonical(content)) };
};
const manifestOf = (set) => {
  const content = { ...set, frames: set.frames.map((frame) => frame.id) };

  delete content.id;

  return { ...content, id: hash(canonical(content)) };
};

async function upload(set) {
  for (const frame of set.frames) await store.saveFrame({ id: frame.id, data: canonical(frame) });

  return manifestOf(set);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-sets-'));
  store = new FrameSetStore({ dir: path.join(dir, 'framesets') });
});
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));

describe('FrameSet storage', () => {
  it('publishes only committed sets and reads individual frames after a restart', async () => {
    const set = fixture();
    const manifest = await upload(set);

    expect(await store.list()).toEqual([]);
    await store.save(canonical(manifest));
    store = new FrameSetStore({ dir: path.join(dir, 'framesets') });

    const listed = await store.list();

    expect(listed).toMatchObject([{ id: manifest.id, name: set.name, frames: 1, classCount: set.classes.length }]);
    expect(listed[0]).not.toHaveProperty('image');
    expect(JSON.parse((await store.read(manifest.id)).manifest)).toEqual(manifest);
    expect(JSON.parse(await store.frame(set.frames[0].id))).toEqual(set.frames[0]);
    expect(await store.read('0'.repeat(64))).toBeNull();
  });
  it('keeps summaries small when 256 classes have 2000-character names', async () => {
    const set = fixture();

    set.classes = Array.from({ length: 256 }, (_, id) => ({ id, name: 'c'.repeat(2000), kind: 'box' }));

    const manifest = await upload(set);

    await store.save(canonical(manifest));

    const listed = await store.list();

    expect(listed).toMatchObject([{ id: manifest.id, classCount: 256 }]);
    expect(listed[0]).not.toHaveProperty('classes');
    expect(Buffer.byteLength(JSON.stringify(listed[0]))).toBeLessThan(512);
    expect(JSON.parse((await store.read(manifest.id)).manifest).classes).toEqual(set.classes);
  });
  it('rejects hostile ids, oversized frames and missing data before publication', async () => {
    for (const id of ['../auth', '..\\auth', 'CON', '', 'x'.repeat(200), 3, null]) {
      await expect(store.saveFrame({ id, data: '{}' })).rejects.toThrow();
      await expect(store.read(id)).rejects.toThrow();
      await expect(store.frame(id)).rejects.toThrow();
    }

    await expect(store.saveFrame({ id: fixture().frames[0].id, data: 'x'.repeat(MAX_FRAME_BYTES + 1) })).rejects.toThrow();
    await expect(store.save(canonical(manifestOf(fixture())))).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });
  it('derives summaries from checked content and checks frame and set hashes', async () => {
    const set = fixture();
    const manifest = await upload(set);

    await store.save(canonical(manifest));
    await expect(store.save(canonical({ ...manifest, name: 'Forged' }))).rejects.toThrow();
    await expect(store.saveFrame({ id: set.frames[0].id, data: canonical({ ...set.frames[0], width: 2 }) })).rejects.toThrow();
    expect((await store.list())[0].name).toBe('Cubes');
    await fs.rm(path.join(dir, 'framesets', 'frames', set.frames[0].id + '.json'));
    await expect(store.frame(set.frames[0].id)).rejects.toThrow();
    await expect(store.save(canonical(manifest))).rejects.toThrow();
  });
});
