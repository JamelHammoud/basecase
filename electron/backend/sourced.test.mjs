import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listSourced, removeSourced, saveSourced, sourcedDir, sourcedMesh } from './sourced.mjs';

const fetcher = async () => new Response('<h1>T-1 thing</h1>');
const item = {
  id: 'maker-thing',
  kind: 'material',
  name: 'Thing',
  maker: 'Maker',
  mpn: 'T-1',
  spec: 'A thing',
  url: 'https://maker.example/t-1',
  sources: [{ claim: 'size', url: 'https://maker.example/t-1.pdf' }],
};

describe('sourced items', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sourced-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('saves an item with its link check', async () => {
    const saved = await saveSourced(dir, item, fetcher);

    expect(saved.link.status).toBe('confirmed');
    expect(listSourced(dir).map((x) => x.id)).toEqual(['maker-thing']);
  });

  it('refuses an id that could leave the folder', async () => {
    await expect(saveSourced(dir, { ...item, id: '../../evil' }, fetcher)).rejects.toThrow();
    expect(() => sourcedDir(dir, '../evil')).toThrow();
    expect(sourcedMesh(dir, '..')).toBeNull();
  });

  it('refuses a link that is not https', async () => {
    await expect(saveSourced(dir, { ...item, url: 'file:///etc/passwd' }, fetcher)).rejects.toThrow('https');
    await expect(
      saveSourced(dir, { ...item, sources: [{ claim: 'x', url: 'http://169.254.169.254/' }] }, fetcher),
    ).rejects.toThrow('https');
  });

  it('removes an item and its files', async () => {
    await saveSourced(dir, item, fetcher);
    fs.mkdirSync(sourcedDir(dir, item.id), { recursive: true });
    removeSourced(dir, item.id);

    expect(listSourced(dir)).toEqual([]);
    expect(fs.existsSync(sourcedDir(dir, item.id))).toBe(false);
  });
});
