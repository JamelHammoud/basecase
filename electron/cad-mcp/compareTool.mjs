import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { IMAGE_EXT, NO_WEB, REFERENCES_DIR, VIEW, bridge, evidencePath, fail, fetchWithTimeout } from './shared.mjs';

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

  return { mime, buf: Buffer.from(await res.arrayBuffer()) };
}

function loadEvidenceReference(r) {
  const full = evidencePath(r);

  return { buf: fs.readFileSync(full), mime: IMAGE_EXT[path.extname(full).toLowerCase()] };
}

async function readReference(r) {
  if (/^ref-\d+$/i.test(r)) return loadSavedReference(r);

  if (/^https?:\/\//i.test(r)) return loadWebReference(r);

  return loadEvidenceReference(r);
}

async function loadReference(ref) {
  const r = String(ref).trim();
  const { buf, mime } = await readReference(r);

  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime || '')) throw new Error(`${r} is not a PNG, JPEG, WebP or GIF image.`);

  if (buf.length > 20_000_000) throw new Error(`${r} is larger than 20 MB.`);

  return `data:${mime};base64,${buf.toString('base64')}`;
}

const isProfiled = (ids) => (p) =>
  p.bounds &&
  !p.hidden &&
  p.role !== 'reference' &&
  p.role !== 'cutout' &&
  !p.referenceImage &&
  (!ids?.length || ids.includes(p.id));

function profileRow({ parts, zMin, H, k }) {
  const f = (v) => (v / H).toFixed(2);
  const z0 = zMin + (k * H) / 10,
    z1 = zMin + ((k + 1) * H) / 10;
  const inBand = parts.filter((p) => p.bounds.max[2] > z0 && p.bounds.min[2] < z1);

  if (!inBand.length) return `${f(z0 - zMin)}–${f(z1 - zMin)} H: empty`;

  const x0 = Math.min(...inBand.map((p) => p.bounds.min[0])),
    x1 = Math.max(...inBand.map((p) => p.bounds.max[0]));
  const y0 = Math.min(...inBand.map((p) => p.bounds.min[1])),
    y1 = Math.max(...inBand.map((p) => p.bounds.max[1]));
  const wx = (p) => p.bounds.max[0] - p.bounds.min[0];
  const widest = [...inBand].sort((a, b) => wx(b) - wx(a)).slice(0, 3);

  return `${f(z0 - zMin)}–${f(z1 - zMin)} H: width ${f(x1 - x0)} H (${Math.round(x1 - x0)} mm), depth ${f(y1 - y0)} H · ${widest.map((p) => `${p.id} ${f(wx(p))}`).join(', ')}`;
}

function profileText(scene, ids) {
  const parts = (scene.parts || []).filter(isProfiled(ids));

  if (!parts.length) return '';

  const zMin = Math.min(...parts.map((p) => p.bounds.min[2]));
  const zMax = Math.max(...parts.map((p) => p.bounds.max[2]));
  const H = zMax - zMin;

  if (H <= 0) return '';

  const rows = [];

  for (let k = 9; k >= 0; k--) rows.push(profileRow({ parts, zMin, H, k }));

  return [
    `Model profile from part bounding boxes (H = ${Math.round(H)} mm; widths are x spans, so rotated parts read a little wide), top to bottom:`,
    ...rows,
    'Measure the same bands in the reference (as fractions of its height) and fix any band whose width or depth is off by more than ~10%.',
  ].join('\n');
}

function bandFlag(r, ratio) {
  if (!(r > 0.005 && (ratio < 0.85 || ratio > 1.15))) return '';

  return ratio < 1 ? '  ← model too narrow' : '  ← model too wide';
}

function silhouetteRows(sc) {
  return sc.reference.bands.map((r, i) => {
    const m = sc.model.bands[i] ?? 0;
    const ratio = r > 0.005 ? m / r : 0;
    const flag = bandFlag(r, ratio);

    return `${i * 10}–${(i + 1) * 10}% from top: photo ${r.toFixed(2)}, model ${m.toFixed(2)}${r > 0.005 ? ` (×${ratio.toFixed(2)})` : ''}${flag}`;
  });
}

async function silhouetteText({ refUrl, reference, straight, ids }) {
  try {
    const sc = await bridge('silhouette_compare', { reference: refUrl, view: straight, ids }, 60000);

    if (sc?.plain && sc.reference && sc.model) {
      return [
        `Measured silhouettes, ${straight} view vs ${reference} (only meaningful if that photo is straight-on from the ${straight}; perspective photos distort widths 5–10%, so bands are flagged beyond ±15%; width of each tenth of the height, as a fraction of the height):`,
        ...silhouetteRows(sc),
        `Overall width/height: photo ${sc.reference.aspect.toFixed(2)}, model ${sc.model.aspect.toFixed(2)}.`,
      ].join('\n');
    }

    if (sc && !sc.plain) return `(No measured silhouette for ${reference}: ${sc.reason ?? 'background not plain'}.)`;
  } catch {}

  return '';
}

const CHECKLIST = [
  'Compare them subassembly by subassembly, top to bottom:',
  '1. Silhouette: where does each subassembly start and end, as a fraction of total height? How wide is each one relative to the height and to its neighbours (e.g. base vs column, head vs torso)?',
  "2. Shape: each shell's profile (taper, roundness, flat vs domed, corner radii), the visible seams and splits, and which part each feature belongs to (a camera on a cap brim belongs to the cap).",
  '3. Missing or extra features.',
  "Shadows, reflections, highlights and colour changes are not geometry unless you can see an edge, gap or step. If the photo is at an angle you didn't match, call compare again with a closer az/el.",
  'Write the 3 biggest differences, then fix them before moving on.',
].join('\n');

async function smallReference(refUrl) {
  try {
    const small = await bridge('downscale_image', { dataUrl: refUrl, maxSide: 1024 }, 20000);

    if (small?.dataUrl) return small.dataUrl;
  } catch {}

  return refUrl;
}

function pushImage(content, dataUrl) {
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUrl || '');

  if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
}

export const compare = {
  name: 'compare',
  config: {
    title: 'Compare with reference',
    description:
      'Shows a reference image (ref-N from the chat, an evidence path, or an image URL) next to renders of your model from the matching viewpoint, so you can check shapes and proportions against the real thing. ' +
      'Pick views that match the photo: front/side/back/top for straight-on shots and drawings, or "az:<deg>,el:<deg>" for angled photos (az 0 = front, +90 = the robot\'s left side, −90 its right; el = degrees above horizontal). ' +
      'Use it after the block-out, after each subassembly and before you finish. Pass ids to compare one subassembly with a close-up photo.',
    inputSchema: {
      reference: z.string().describe('ref-N, an evidence path, or an image URL'),
      views: z.array(VIEW).min(1).max(3).default(['front']),
      ids: z.array(z.string()).optional().describe('Only render these parts (for close-up photos)'),
    },
  },
  handler: async ({ reference, views, ids }) => {
    try {
      const refUrl = await smallReference(await loadReference(reference));
      const [shots, scene] = await Promise.all([
        bridge('screenshot', { views, ids }, 60000),
        bridge('snapshot', {}).catch(() => null),
      ]);
      const content = [{ type: 'text', text: `Reference ${reference}:` }];

      pushImage(content, refUrl);

      for (const shot of shots.images || []) {
        content.push({ type: 'text', text: `Your model, ${shot.view}${ids?.length ? ` (${ids.join(', ')})` : ''}:` });
        pushImage(content, shot.dataUrl);
      }

      const profile = scene ? profileText(scene, ids) : '';

      if (profile) content.push({ type: 'text', text: profile });

      const straight = views.find((v) => ['front', 'back', 'side'].includes(v));
      const silhouette = straight ? await silhouetteText({ refUrl, reference, straight, ids }) : '';

      if (silhouette) content.push({ type: 'text', text: silhouette });

      content.push({ type: 'text', text: CHECKLIST });

      return { content };
    } catch (err) {
      return fail(err);
    }
  },
};
