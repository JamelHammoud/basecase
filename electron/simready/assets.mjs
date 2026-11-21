import fs from 'node:fs';
import path from 'node:path';
import { eachLimited } from '../eachLimited.mjs';
import { serviceRefusal } from '../refusal.mjs';
import { fileSize, MB } from '../fileSize.mjs';
import { percent } from '../percent.mjs';
import { readCapped } from '../publicFetch.mjs';

const HF = 'https://huggingface.co';
const SKIP_DIRS = ['/source_assets/', '/.thumbs/', '/.metadata/'];
const IMAGE = /\.(png|jpe?g|exr|hdr|tga|tiff?|bmp|dds|ktx2?)$/i;
const NOT_ALBEDO =
  /(^|[_.-])(normal|nrm|n|orm|rough(ness)?|metal(lic|ness)?|ao|occlusion|height|disp(lacement)?|bump|mask|opacity|emissive|spec(ular)?|gloss)([_.-]|$)/i;
const MAX_FILE = 200 * MB;
const MAX_TOTAL = 600 * MB;

const refused = (res) =>
  new Error(serviceRefusal('SimReady Central', { status: res.status, again: 'Insert it again' }));

export { parseAssetUrl } from './catalog.mjs';

export const assetKey = (a) => `${a.namespace}--${a.dataset}--${a.packageName}--${a.sha.slice(0, 12)}`;

const fileUrl = (a, file) =>
  `${HF}/datasets/${a.namespace}/${a.dataset}/resolve/${a.sha}/${file.split('/').map(encodeURIComponent).join('/')}`;

async function listTree(a) {
  const files = [];
  let next = `${HF}/api/datasets/${a.namespace}/${a.dataset}/tree/${a.sha}/${encodeURIComponent(a.packageName)}?recursive=true`;

  for (let page = 0; next && page < 50; page++) {
    if (!URL.canParse(next) || new URL(next).origin !== HF) throw refused({ status: 200 });

    const res = await fetch(next, { redirect: 'manual' });

    if (!res.ok) throw refused(res);

    const entries = await res.json();

    if (!Array.isArray(entries) || !entries.every(validEntry)) throw refused(res);

    files.push(...entries.filter((e) => e.type === 'file'));

    next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
  }

  return files;
}

function validEntry(entry) {
  const size = entry?.size;

  return typeof entry?.path === 'string' && Number.isFinite(size) && size >= 0;
}

export function neededFiles(entries) {
  return entries.filter((e) => {
    const p = `/${e.path}`;

    if (SKIP_DIRS.some((d) => p.includes(d))) return false;

    if (IMAGE.test(p) && NOT_ALBEDO.test(path.basename(p))) return false;

    return e.size <= MAX_FILE;
  });
}

function insideDir(dir, file) {
  const target = path.resolve(dir, file);

  if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error('The asset has a file outside its folder.');

  return target;
}

function addBytes(budget, size) {
  if (budget.bytes + size > MAX_TOTAL) {
    throw new Error(`The asset is larger than ${fileSize(MAX_TOTAL)}. Choose a smaller one.`);
  }

  budget.bytes += size;
}

async function downloadOne(a, entry, dir, budget) {
  const target = insideDir(dir, entry.path);

  if (fs.existsSync(target) && fs.statSync(target).size === entry.size) {
    addBytes(budget, entry.size);

    return;
  }

  const res = await fetch(fileUrl(a, entry.path));

  if (!res.ok) throw refused(res);

  const data = await readCapped(res, Math.min(MAX_FILE, entry.size));

  addBytes(budget, data.byteLength);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}

export async function downloadAsset(a, dir, say) {
  say('Listing files…');

  const files = neededFiles(await listTree(a));
  const total = files.reduce((s, f) => s + f.size, 0);

  addBytes({ bytes: 0 }, total);

  if (!files.some((f) => f.path === a.rootPath)) throw new Error('The asset’s main file is missing.');

  files.forEach((f) => insideDir(dir, f.path));

  let done = 0;
  let bytes = 0;
  const budget = { bytes: 0 };

  await eachLimited(files, 6, async (f) => {
    await downloadOne(a, f, dir, budget);
    done++;
    bytes += f.size;
    say(`Downloading ${percent(bytes / Math.max(total, 1))}`, { done, total: files.length });
  });

  return path.join(dir, a.rootPath);
}
