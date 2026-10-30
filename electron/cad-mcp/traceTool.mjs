import { z } from 'zod';
import { photoMasks } from './photoMask.mjs';
import { loadReference } from './references.mjs';
import { bridge, fail } from './shared.mjs';
import { maskSource, smallReference } from './silhouetteMeasure.mjs';

const AXES = { front: '[x, z]', side: '[y, z] (front = −y)', top: '[x, y]' };
const KEYS = { front: 'front', side: 'side', top: 'top' };

function widthFlag(diff, mm) {
  if (Math.abs(diff) <= Math.max(2, 0.08 * mm)) return '';

  return diff > 0 ? '  ← model wider' : '  ← model narrower';
}

function bandRows(traced, model) {
  return traced.bandsMm.map((mm, i) => {
    const m = model?.[i];
    const range = `${i * 10}–${(i + 1) * 10}%`;

    if (m === undefined) return `${range}: ${Math.round(mm)} mm`;

    const diff = m - mm;

    return `${range}: ${Math.round(mm)} → ${Math.round(m)} mm (${diff >= 0 ? '+' : '−'}${Math.round(Math.abs(diff))})${widthFlag(diff, mm)}`;
  });
}

function traceText(name, res) {
  const { traced, view } = res;
  const scale =
    res.scaledFrom === 'height' ? 'scaled to the height you gave' : "scaled to the model's height for these parts";

  return [
    `Outline of ${name}, ${view} view, ${traced.points.length} points ${AXES[view] ?? AXES.front} in mm (${scale}):`,
    `${KEYS[view] ?? 'front'}: ${JSON.stringify(traced.points)}`,
    `Size: ${traced.widthMm} × ${traced.heightMm} mm.`,
    res.model
      ? 'Width per tenth of the height, top to bottom (photo → model):'
      : 'Width per tenth of the height, top to bottom:',
    ...bandRows(traced, res.model),
    `Photo mask: ${maskSource(res)}.`,
    'Use the points as a profileBody outline (trace the other view for its partner outline), then compare again.',
  ].join('\n');
}

export const traceOutline = {
  name: 'trace_outline',
  config: {
    title: 'Trace an outline',
    description:
      'Traces the subject of a straight-on reference photo into outline points in mm, ready for profileBody, and lists how far your model is from it per tenth of the height. ' +
      'Pass region (fractions of the photo: [left, top, right, bottom]) to trace one shell, with ids for the parts that shell is (their height sets the scale), or height_mm when it has no parts yet.',
    inputSchema: {
      reference: z.string().describe('ref-N, an evidence path, or an image URL'),
      view: z.enum(['front', 'side', 'top']).default('front').describe('Which way the photo looks at the subject'),
      region: z.array(z.number().min(0).max(1)).length(4).optional(),
      ids: z.array(z.string()).optional().describe('The parts the traced region shows'),
      height_mm: z.number().positive().optional().describe('Real height of the traced region, if known'),
      points: z.number().int().min(12).max(32).default(20),
    },
  },
  handler: async ({ reference, view, region, ids, height_mm, points }) => {
    try {
      const ref = await loadReference(reference);

      if (ref.svg) throw new Error('trace_outline needs a photo; compare measures SVG outlines.');

      const res = await bridge(
        'trace_outline',
        {
          reference: await smallReference(ref.dataUrl),
          masks: await photoMasks(ref.buf),
          view,
          region,
          ids,
          heightMm: height_mm,
          points,
        },
        60000,
      );

      if (!res?.traced) return { content: [{ type: 'text', text: `No outline for ${reference}: ${res?.reason}.` }] };

      return { content: [{ type: 'text', text: traceText(ref.name, res) }] };
    } catch (err) {
      return fail(err);
    }
  },
};
