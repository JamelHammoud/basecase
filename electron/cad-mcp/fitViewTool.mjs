import { z } from 'zod';
import { exifFocal } from './exifFocal.mjs';
import { photoMasks } from './photoMask.mjs';
import { loadReference } from './references.mjs';
import { bridge, fail } from './shared.mjs';
import { maskSource, silhouetteRows, smallReference } from './silhouetteMeasure.mjs';

const r = (v) => Math.round(v);

function cameraLine(name, res, focal) {
  const c = res.camera;
  const seeded = focal?.focal35 && res.seededFov ? ` (from the photo's ${r(focal.focal35)} mm focal length)` : '';

  return `Camera fitted to ${name} (${res.renders} renders): az ${r(c.az)}°, el ${r(c.el)}°, roll ${r(c.roll)}°, vertical FOV ${r(c.fov)}°${seeded}, ${r(c.distanceMm)} mm from the model's centre.`;
}

function fitText(name, res, focal) {
  const lines = [
    cameraLine(name, res, focal),
    `Silhouette overlap (IoU) ${res.iou.toFixed(2)}; outlines ${res.contourMm} mm apart on average (at the model's scale).`,
  ];

  if (res.photo && res.model) {
    lines.push(
      'Width per tenth of the height in this camera, as a fraction of the height (flagged beyond ±15%):',
      ...silhouetteRows({ reference: res.photo, model: res.model }),
    );
  }

  lines.push(
    `Photo mask: ${maskSource(res)}.`,
    'Overlay: red is the photo only, blue is the model only, grey is both.',
    "A silhouette can't tell front from back on a symmetric robot: pass az near the view you expect. Bands where the photo is posed differently (hands, head turn) aren't shape errors.",
  );

  return lines.join('\n');
}

export const fitView = {
  name: 'fit_view',
  config: {
    title: 'Fit the camera to a photo',
    description:
      "Finds the camera a reference photo was taken from (azimuth, elevation, roll, field of view, distance) by fitting your model's silhouette to the photo's, seeded from the photo's EXIF focal length when it has one. " +
      "Returns the overlap, the outline distance in mm and width bands in that camera, plus a red/blue overlay. Use it for close-range or angled photos, where compare's fixed camera would count lens perspective as design error. It takes a few seconds.",
    inputSchema: {
      reference: z.string().describe('ref-N, an evidence path, or an image URL'),
      az: z.number().optional().describe('Search near this azimuth (0 = front, +90 = the left side)'),
      fov: z.number().min(5).max(100).optional().describe('Vertical field of view in degrees, if known'),
      ids: z.array(z.string()).optional().describe('Only these parts (for a close-up photo)'),
    },
  },
  handler: async ({ reference, az, fov, ids }) => {
    try {
      const ref = await loadReference(reference);

      if (ref.svg) throw new Error('fit_view needs a photo; compare measures SVG outlines.');

      const focal = exifFocal(ref.buf);
      const payload = {
        reference: await smallReference(ref.dataUrl),
        masks: await photoMasks(ref.buf),
        focal35: focal?.focal35 ?? undefined,
        az,
        fov,
        ids,
      };
      const res = await bridge('fit_view', payload, 180000);

      if (!res?.camera) return { content: [{ type: 'text', text: `No fit for ${reference}: ${res?.reason}.` }] };

      const content = [{ type: 'text', text: fitText(ref.name, res, focal) }];
      const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(res.overlay ?? '');

      if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });

      return { content };
    } catch (err) {
      return fail(err);
    }
  },
};
