import { z } from 'zod';
import { addSourcedItem } from '../cad-mcp/readinessTools.mjs';
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

  it('preserves exact supplier identity and its conversion through storage, and clears it on a changed product link', async () => {
    const supplierIdentity = {
      supplier: 'DigiKey',
      supplierPartNumber: 'T-1-CT-ND',
      orderingUnit: 'piece',
      unitsPerOrder: 1,
      sourceUrl: 'https://supplier.example/t-1',
    };

    await saveSourced(dir, z.object(addSourcedItem.config.inputSchema).parse({ ...item, supplierIdentity }), fetcher);
    expect(listSourced(dir)[0].supplierIdentity).toEqual(supplierIdentity);
    await saveSourced(dir, item, fetcher);
    expect(listSourced(dir)[0].supplierIdentity).toEqual(supplierIdentity);
    await saveSourced(dir, { ...item, url: 'https://other.example/t-1' }, fetcher);
    expect(listSourced(dir)[0].supplierIdentity).toBeUndefined();
  });

  it('refuses a non-HTTPS identity source and retains unknown conversion as unknown', async () => {
    await expect(
      saveSourced(dir, { ...item, supplierIdentity: { sourceUrl: 'file:///etc/passwd' } }, fetcher),
    ).rejects.toThrow('https');

    const saved = await saveSourced(
      dir,
      { ...item, supplierIdentity: { supplier: 'DigiKey', unitsPerOrder: -4 } },
      fetcher,
    );

    expect(saved.supplierIdentity.unitsPerOrder).toBeUndefined();
  });

  it('refuses a non-HTTPS identity source and leaves an unknown conversion blank', async () => {
    await expect(
      saveSourced(dir, { ...item, supplierIdentity: { sourceUrl: 'file:///etc/passwd' } }, fetcher),
    ).rejects.toThrow('https');

    const saved = await saveSourced(
      dir,
      {
        ...item,
        supplierIdentity: { supplier: 'Maker', supplierPartNumber: 'T-1', orderingUnit: 'pack', unitsPerOrder: -1 },
      },
      fetcher,
    );

    expect(saved.supplierIdentity.unitsPerOrder).toBeUndefined();
    expect(listSourced(dir)[0].supplierIdentity.unitsPerOrder).toBeUndefined();
  });

  it('refuses a price date that is not YYYY-MM-DD', async () => {
    const price = { usd: 4, per: 1, store: 'Maker', url: 'https://maker.example/t-1', seen: '2026-11-04' };

    await expect(saveSourced(dir, { ...item, price: { ...price, seen: 'today' } }, fetcher)).rejects.toThrow();
    expect((await saveSourced(dir, { ...item, price }, fetcher)).price.seen).toBe('2026-11-04');
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
