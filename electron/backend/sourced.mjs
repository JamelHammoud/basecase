import fs from 'node:fs';
import path from 'node:path';
import { assertHttps, checkProductLink } from '../cadImport/linkCheck.mjs';
import { checkedFileId } from './constants.mjs';

const KINDS = new Set(['part', 'material', 'equipment']);
const MAX_TEXT = 400;
const MAX_SOURCES = 20;

const storeFile = (libraryDir) => path.join(libraryDir, 'sourced-parts.json');

export const sourcedDir = (libraryDir, id) => path.join(libraryDir, 'sourced-parts', checkedFileId(id));

export function listSourced(libraryDir) {
  try {
    return JSON.parse(fs.readFileSync(storeFile(libraryDir), 'utf-8'));
  } catch {
    return [];
  }
}

function writeAll(libraryDir, items) {
  fs.writeFileSync(storeFile(libraryDir), JSON.stringify(items, null, 2), 'utf-8');
}

export function putSourced(libraryDir, item) {
  const all = listSourced(libraryDir).filter((x) => x.id !== item.id);

  writeAll(libraryDir, [...all, item]);

  return item;
}

const text = (v, limit = MAX_TEXT) => String(v ?? '').slice(0, limit);

function cleanPrice(price) {
  if (!price) return undefined;

  assertHttps(price.url, 'The price link');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(price.seen)) throw new Error('price.seen must be a date, YYYY-MM-DD.');

  return {
    usd: Number(price.usd),
    per: Math.max(1, Number(price.per) || 1),
    store: text(price.store, 80),
    url: price.url,
    seen: price.seen,
  };
}

function cleanItem(p, existing) {
  const id = checkedFileId(p.id);

  if (!KINDS.has(p.kind)) throw new Error('kind must be part, material or equipment.');

  assertHttps(p.url);

  return {
    ...existing,
    id,
    kind: p.kind,
    name: text(p.name, 80),
    maker: text(p.maker, 80),
    mpn: text(p.mpn, 80),
    spec: text(p.spec),
    url: p.url,
    group: p.group,
    mounting: p.mounting ? text(p.mounting) : undefined,
    weightG: p.weightG === undefined ? existing?.weightG : Number(p.weightG),
    price: cleanPrice(p.price) ?? existing?.price,
    sources: (p.sources ?? existing?.sources ?? []).slice(0, MAX_SOURCES).map((s) => {
      assertHttps(s.url, 'A source link');

      return { claim: text(s.claim, 160), url: s.url };
    }),
    addedAt: existing?.addedAt ?? new Date().toISOString(),
  };
}

export async function saveSourced(libraryDir, payload, fetcher) {
  const existing = listSourced(libraryDir).find((x) => x.id === payload.id);
  const item = cleanItem(payload, existing);
  const link = await checkProductLink(item, fetcher);

  return putSourced(libraryDir, { ...item, link });
}

export function removeSourced(libraryDir, id) {
  const safe = checkedFileId(id);

  writeAll(
    libraryDir,
    listSourced(libraryDir).filter((x) => x.id !== safe),
  );
  fs.rmSync(sourcedDir(libraryDir, safe), { recursive: true, force: true });

  return listSourced(libraryDir);
}

export function sourcedMesh(libraryDir, id) {
  try {
    return fs.readFileSync(path.join(sourcedDir(libraryDir, id), 'mesh.glb'));
  } catch {
    return null;
  }
}
