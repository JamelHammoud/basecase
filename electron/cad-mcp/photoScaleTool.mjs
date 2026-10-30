import { z } from 'zod';
import { photoMasks } from './photoMask.mjs';
import { loadReference } from './references.mjs';
import { bridge, fail, text } from './shared.mjs';
import { maskSource, smallReference } from './silhouetteMeasure.mjs';

function scaleText(name, res, sizeMm) {
  const box = res.tightened ? 'the subject inside your box' : 'your box';

  return [
    `Scale of ${name}: ${res.mmPerPx.toFixed(3)} mm per pixel, from a ${sizeMm} mm ${res.axis} over ${res.partPx} px (${box}).`,
    `So the whole subject is about ${res.subjectMm[0]} × ${res.subjectMm[1]} mm (width × height) in this photo.`,
    'Only as good as the box: 5% off in the box is 5% off in every size. Parts nearer the camera than the reference part read larger.',
    `Photo mask: ${maskSource(res)}.`,
  ].join('\n');
}

export const photoScale = {
  name: 'photo_scale',
  config: {
    title: 'Scale a photo from a known part',
    description:
      'Sets mm per pixel in a reference photo from a part of known size that it shows (a catalog servo, board or wheel: its size comes from find_parts), and returns the overall size of the subject in mm. ' +
      'Give region as fractions of the photo [left, top, right, bottom] tight around that part, and which of its sizes the photo shows straight on.',
    inputSchema: {
      reference: z.string().describe('ref-N, an evidence path, or an image URL'),
      region: z.array(z.number().min(0).max(1)).length(4),
      size_mm: z.number().positive().describe('Real length of the part along axis'),
      axis: z.enum(['width', 'height']).default('width').describe('Which way that length runs in the photo'),
    },
  },
  handler: async ({ reference, region, size_mm, axis }) => {
    try {
      const ref = await loadReference(reference);

      if (ref.svg) throw new Error('photo_scale needs a photo.');

      const res = await bridge(
        'photo_scale',
        {
          reference: await smallReference(ref.dataUrl),
          masks: await photoMasks(ref.buf),
          region,
          sizeMm: size_mm,
          axis,
        },
        60000,
      );

      if (!res?.mmPerPx) return text(`No scale for ${reference}: ${res?.reason}.`);

      return text(scaleText(ref.name, res, size_mm));
    } catch (err) {
      return fail(err);
    }
  },
};
