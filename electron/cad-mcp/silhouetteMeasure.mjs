import { photoMasks } from './photoMask.mjs';
import { bridge } from './shared.mjs';

const TOLERANCE = 0.15;
const ANGLED_MISMATCH = 0.35;

export async function smallReference(dataUrl, maxSide = 1024) {
  try {
    const small = await bridge('downscale_image', { dataUrl, maxSide }, 20000);

    if (small?.dataUrl) return small.dataUrl;
  } catch {}

  return dataUrl;
}

export async function measureSilhouette({ ref, views, ids, small }) {
  const masks = await photoMasks(ref.buf);

  return bridge(
    'silhouette_compare',
    { reference: small ?? (await smallReference(ref.dataUrl)), masks, views, ids },
    60000,
  );
}

const pct = (band) => `${band * 10}–${(band + 1) * 10}%`;

function bandFlag(r, ratio) {
  if (!(r > 0.005 && (ratio < 1 - TOLERANCE || ratio > 1 + TOLERANCE))) return '';

  return ratio < 1 ? '  ← model too narrow' : '  ← model too wide';
}

export function silhouetteRows(sc) {
  return sc.reference.bands.map((r, i) => {
    const m = sc.model.bands[i] ?? 0;
    const ratio = r > 0.005 ? m / r : 0;

    return `${pct(i)} from top: photo ${r.toFixed(2)}, model ${m.toFixed(2)}${r > 0.005 ? ` (×${ratio.toFixed(2)})` : ''}${bandFlag(r, ratio)}`;
  });
}

export function maskSource(sc) {
  const how = sc.source === 'vision' ? 'Apple Vision foreground mask' : 'flood fill of a plain background';

  return [how, ...(sc.notes ?? [])].join('; ');
}

function bandRuns(sc) {
  const narrow = [],
    wide = [];

  sc.reference.bands.forEach((r, i) => {
    if (r <= 0.005) return;

    const ratio = (sc.model.bands[i] ?? 0) / r;

    if (ratio < 1 - TOLERANCE) narrow.push(`${pct(i)} down (×${ratio.toFixed(2)})`);
    else if (ratio > 1 + TOLERANCE) wide.push(`${pct(i)} down (×${ratio.toFixed(2)})`);
  });

  return { narrow, wide, measured: sc.reference.bands.filter((r) => r > 0.005).length };
}

export function verdictLine(name, sc) {
  if (!sc?.plain || !sc.reference || !sc.model) return `${name}: not measured (${sc?.reason ?? 'no silhouette'}).`;

  if (sc.mismatch > ANGLED_MISMATCH) {
    return `${name}: matches neither a front nor a side view (an angled photo?); compare it with az/el to check it.`;
  }

  const { narrow, wide, measured } = bandRuns(sc);
  const within = measured - narrow.length - wide.length;
  const parts = [`${within} of ${measured} width bands within 15%`];

  if (narrow.length) parts.push(`model too narrow at ${narrow.join(', ')}`);

  if (wide.length) parts.push(`too wide at ${wide.join(', ')}`);

  return `${name} (${sc.view} view): ${parts.join('; ')}. Width ÷ height: photo ${sc.reference.aspect.toFixed(2)}, model ${sc.model.aspect.toFixed(2)}.`;
}
