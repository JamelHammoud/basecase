import fs from 'node:fs';
import path from 'node:path';

const HF = 'https://huggingface.co';
const SHA = /^[0-9a-f]{40}$/;
const SAFE_SEGMENT = /^[\w.@+-]+$/;
const SKIP_DIRS = ['/source_assets/', '/.thumbs/', '/.metadata/'];
const IMAGE = /\.(png|jpe?g|exr|hdr|tga|tiff?|bmp|dds|ktx2?)$/i;
const NOT_ALBEDO =
  /(^|[_.-])(normal|nrm|n|orm|rough(ness)?|metal(lic|ness)?|ao|occlusion|height|disp(lacement)?|bump|mask|opacity|emissive|spec(ular)?|gloss)([_.-]|$)/i;
const MAX_FILE = 200 * 1024 * 1024;
const MAX_TOTAL = 600 * 1024 * 1024;

export function parseAssetUrl(url) {
  const u = new URL(String(url));
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [kind, namespace, dataset, mode, sha, ...rest] = parts;
  const valid =
    u.hostname === 'huggingface.co' &&
    kind === 'datasets' &&
    (mode === 'blob' || mode === 'resolve') &&
    SHA.test(sha ?? '') &&
    rest.length >= 2 &&
    [namespace, dataset, ...rest].every((s) => SAFE_SEGMENT.test(s) && s !== '..');

  if (!valid) throw new Error('That isn’t a SimReady asset link.');

  return { namespace, dataset, sha, packageName: rest[0], rootPath: rest.join('/') };
}

export const assetKey = (a) => `${a.namespace}--${a.dataset}--${a.packageName}--${a.sha.slice(0, 12)}`;

const fileUrl = (a, file) =>
  `${HF}/datasets/${a.namespace}/${a.dataset}/resolve/${a.sha}/${file.split('/').map(encodeURIComponent).join('/')}`;

async function listTree(a) {
  const files = [];
  let next = `${HF}/api/datasets/${a.namespace}/${a.dataset}/tree/${a.sha}/${encodeURIComponent(a.packageName)}?recursive=true`;

  for (let page = 0; next && page < 50; page++) {
    const res = await fetch(next);

    if (!res.ok) throw new Error(`Couldn’t list the asset’s files (${res.status}).`);

    files.push(...(await res.json()).filter((e) => e.type === 'file'));

    next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
  }

  return files;
}

export function neededFiles(entries) {
  return entries.filter((e) => {
    const p = `/${e.path}`;

    if (SKIP_DIRS.some((d) => p.includes(d))) return false;

    if (IMAGE.test(p) && NOT_ALBEDO.test(path.basename(p))) return false;

    return (e.size ?? 0) <= MAX_FILE;
  });
}

function insideDir(dir, file) {
  const target = path.resolve(dir, file);

  if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error('The asset has a file outside its folder.');

  return target;
}

async function downloadOne(a, entry, dir) {
  const target = insideDir(dir, entry.path);

  if (fs.existsSync(target) && fs.statSync(target).size === entry.size) return;

  const res = await fetch(fileUrl(a, entry.path));

  if (!res.ok) throw new Error(`Couldn’t download ${path.basename(entry.path)} (${res.status}).`);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

export async function downloadAsset(a, dir, say) {
  say('Listing files');

  const files = neededFiles(await listTree(a));
  const total = files.reduce((s, f) => s + (f.size ?? 0), 0);

  if (total > MAX_TOTAL) throw new Error('The asset is larger than 600 MB. Choose a smaller one.');

  if (!files.some((f) => f.path === a.rootPath)) throw new Error('The asset’s main file is missing.');

  const queue = [...files];
  let done = 0;
  let bytes = 0;
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      await downloadOne(a, f, dir);
      done++;
      bytes += f.size ?? 0;
      say(`Downloading ${Math.round((bytes / Math.max(total, 1)) * 100)}%`, { done, total: files.length });
    }
  };

  await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));

  return path.join(dir, a.rootPath);
}
