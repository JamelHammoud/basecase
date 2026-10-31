import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_EXT, NO_WEB, REFERENCES_DIR, bridge, evidencePath, fetchWithTimeout } from './shared.mjs';
import { readCapped } from '../publicFetch.mjs';

const SVG_MIME = 'image/svg+xml';
const used = new Set();

function loadSavedReference(r) {
  if (!REFERENCES_DIR || !fs.existsSync(REFERENCES_DIR)) throw new Error('No reference images saved yet.');

  const file = fs.readdirSync(REFERENCES_DIR).find((f) => f.toLowerCase().startsWith(`${r.toLowerCase()}.`));

  if (!file) throw new Error(`${r} not found. The prompt lists the saved names (ref-N).`);

  return {
    buf: fs.readFileSync(path.join(REFERENCES_DIR, file)),
    mime: IMAGE_EXT[path.extname(file).toLowerCase()],
  };
}

async function loadWebReference(r) {
  if (NO_WEB) throw new Error('Web images are off in this session.');

  const res = await fetchWithTimeout(r, 25000);

  if (!res.ok) throw new Error(`The image URL returned ${res.status}.`);

  const mime =
    (res.headers.get('content-type') || '').split(';')[0].trim() ||
    IMAGE_EXT[path.extname(new URL(r).pathname).toLowerCase()];

  return { mime, buf: await readCapped(res, 25_000_000, 'The image') };
}

function loadEvidenceReference(r) {
  const full = evidencePath(r);
  const ext = path.extname(full).toLowerCase();

  return { buf: fs.readFileSync(full), mime: ext === '.svg' ? SVG_MIME : IMAGE_EXT[ext] };
}

function readReference(r) {
  if (/^ref-\d+$/i.test(r)) return loadSavedReference(r);

  if (/^https?:\/\//i.test(r)) return loadWebReference(r);

  return loadEvidenceReference(r);
}

export async function loadReference(ref) {
  const r = String(ref).trim();

  if (/^(<\?xml|<svg)/i.test(r)) return { name: 'your outline', buf: Buffer.from(r), mime: SVG_MIME, svg: r };

  const { buf, mime } = await readReference(r);

  if (buf.length > 20_000_000) throw new Error(`${r} is larger than 20 MB.`);

  if (mime === SVG_MIME) return { name: r, buf, mime, svg: buf.toString('utf8') };

  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime || '')) {
    throw new Error(`${r} is not a PNG, JPEG, WebP, GIF or SVG image.`);
  }

  if (/^ref-\d+$/i.test(r)) used.add(r.toLowerCase());

  return { name: r, buf, mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
}

export async function chatReferences() {
  let names = [];

  try {
    names = (await bridge('references', {}, 5000))?.names ?? [];
  } catch {}

  return [...new Set([...names.map((n) => String(n).toLowerCase()), ...used])];
}
