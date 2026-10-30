import { z } from 'zod';
import { imageCaps } from './imageCaps.mjs';
import { loadReference } from './references.mjs';
import { VIEW, bridge, fail } from './shared.mjs';
import { maskSource, measureSilhouette, silhouetteRows, smallReference } from './silhouetteMeasure.mjs';
import { targetReply } from './targetCompare.mjs';

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

async function silhouetteText({ ref, refUrl, straight, ids }) {
  try {
    const sc = await measureSilhouette({ ref, views: [straight], ids, small: refUrl });

    if (sc?.plain && sc.reference && sc.model) {
      return [
        `Measured silhouettes, ${straight} view vs ${ref.name} (only meaningful if that photo is straight-on from the ${straight}; perspective photos distort widths 5–10%, so bands are flagged beyond ±15%; width of each tenth of the height, as a fraction of the height):`,
        ...silhouetteRows(sc),
        `Overall width/height: photo ${sc.reference.aspect.toFixed(2)}, model ${sc.model.aspect.toFixed(2)}.`,
        `Photo mask: ${maskSource(sc)}.`,
      ].join('\n');
    }

    if (sc && !sc.plain) return `(No measured silhouette for ${ref.name}: ${sc.reason ?? 'background not plain'}.)`;
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
      reference: z.string().describe('ref-N, an evidence path (SVG too), an image URL, or SVG code the user pasted'),
      views: z.array(VIEW).min(1).max(3).default(['front']),
      ids: z.array(z.string()).optional().describe('Only render these parts (for close-up photos)'),
      target: z
        .boolean()
        .optional()
        .describe(
          'The reference is a target outline (a sketch or drawing the model should match): measure the fit and the gap in mm. SVG references always are.',
        ),
    },
  },
  handler: async ({ reference, views, ids, target }) => {
    try {
      const ref = await loadReference(reference);

      if (ref.svg || target) return await targetReply({ ref, view: views[0], ids });

      const refUrl = await smallReference(ref.dataUrl, imageCaps().photo);
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
      const silhouette = straight ? await silhouetteText({ ref, refUrl, straight, ids }) : '';

      if (silhouette) content.push({ type: 'text', text: silhouette });

      content.push({ type: 'text', text: CHECKLIST });

      return { content };
    } catch (err) {
      return fail(err);
    }
  },
};
