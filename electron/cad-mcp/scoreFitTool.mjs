import { z } from 'zod';
import { chatReferences, loadReference } from './references.mjs';
import { fail, text } from './shared.mjs';
import { measureSilhouette } from './silhouetteMeasure.mjs';

const ANGLED = 0.35;
const TOLERANCE = 0.15;

export function fitScore(sc, skip = []) {
  const bands = sc.reference.bands
    .map((r, i) => ({ r, m: sc.model.bands[i] ?? 0, i }))
    .filter((b) => b.r > 0.005 && !skip.includes(b.i));

  if (!bands.length) return null;

  const logs = bands.map((b) => Math.abs(Math.log(Math.max(b.m, 0.005) / b.r)));
  const within = logs.filter((l) => l <= Math.log(1 + TOLERANCE)).length;
  const aspect = Math.abs(Math.log(Math.max(sc.model.aspect, 0.01) / Math.max(sc.reference.aspect, 0.01)));
  const mismatch = logs.reduce((s, l) => s + l, 0) / logs.length + aspect;

  return { score: Math.round(100 * Math.exp(-mismatch)), within, measured: bands.length };
}

async function scoreReference(name, { ids, skip }) {
  try {
    const sc = await measureSilhouette({ ref: await loadReference(name), views: ['front', 'side'], ids });

    if (!sc?.plain || !sc.reference || !sc.model) return { name, note: `not measured (${sc?.reason})` };

    if (sc.mismatch > ANGLED) return { name, note: 'angled photo, left out' };

    const fit = fitScore(sc, skip);

    return fit ? { name, view: sc.view, ...fit } : { name, note: 'no bands left to score' };
  } catch (err) {
    return { name, note: `not measured (${String(err?.message ?? err)})` };
  }
}

function summary(rows) {
  const scored = rows.filter((r) => r.score !== undefined);
  const lines = rows.map((r) =>
    r.score === undefined
      ? `- ${r.name}: ${r.note}`
      : `- ${r.name} (${r.view}): ${r.score}, ${r.within} of ${r.measured} width bands within 15%`,
  );

  if (!scored.length) return ['No reference could be scored.', ...lines].join('\n');

  const mean = Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);

  return [`Silhouette fit ${mean} of 100 over ${scored.length} reference(s):`, ...lines].join('\n');
}

export const scoreFit = {
  name: 'score_fit',
  config: {
    title: 'Score the fit to the references',
    description:
      'One number for how well the model (or the parts in ids) matches the reference photos: width bands and overall proportions, in the straight view each photo matches best (100 = identical, angled photos left out). ' +
      'Use it to pick between alternative block-outs: build each as its own group, score each by ids, keep the best. Leave out bands where a photo is posed differently with skip_bands (0 = top tenth).',
    inputSchema: {
      references: z.array(z.string()).max(6).optional().describe('Defaults to the photos attached in this chat'),
      ids: z.array(z.string()).optional(),
      skip_bands: z.array(z.number().int().min(0).max(9)).optional(),
    },
  },
  handler: async ({ references, ids, skip_bands }) => {
    try {
      const names = references?.length ? references : (await chatReferences()).slice(0, 6);

      if (!names.length) return text('No reference photos to score against.');

      const rows = [];

      for (const name of names) rows.push(await scoreReference(name, { ids, skip: skip_bands ?? [] }));

      return text(summary(rows));
    } catch (err) {
      return fail(err);
    }
  },
};
