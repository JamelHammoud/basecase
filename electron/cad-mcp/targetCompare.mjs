import { photoMasks } from './photoMask.mjs';
import { bridge } from './shared.mjs';

const RASTER_SIDE = 900;
const MM_PER_UNIT = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };

const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];

function lengthOf(value) {
  const m = /^\s*([\d.]+)\s*([a-z%]*)\s*$/i.exec(value ?? '');

  if (!m) return null;

  return {
    value: Number(m[1]),
    mm: MM_PER_UNIT[m[2].toLowerCase()] ? Number(m[1]) * MM_PER_UNIT[m[2].toLowerCase()] : null,
  };
}

function viewBoxSize(tag) {
  const box = (attr(tag, 'viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  return box.length === 4 && box[2] > 0 && box[3] > 0 ? { w: box[2], h: box[3] } : null;
}

export function normalizeSvg(svg) {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0];

  if (!tag) throw new Error('That SVG has no <svg> element.');

  const width = lengthOf(attr(tag, 'width'));
  const height = lengthOf(attr(tag, 'height'));
  const box = viewBoxSize(tag) ?? (width && height ? { w: width.value, h: height.value } : null);

  if (!box) throw new Error('That SVG has no size: give it a viewBox or a width and height.');

  const k = RASTER_SIDE / Math.max(box.w, box.h);
  const sized = tag
    .replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<svg\b/i, `<svg width="${Math.round(box.w * k)}" height="${Math.round(box.h * k)}"`);
  const withBox = attr(sized, 'viewBox') ? sized : sized.replace(/<svg\b/i, `<svg viewBox="0 0 ${box.w} ${box.h}"`);

  return { svg: svg.replace(tag, withBox), heightMm: height?.mm ?? null };
}

const r = (v) => Math.round(v);

function cornerLine({ target, model }) {
  const tighter = model.top < 0.75 * target.top || model.bottom < 0.75 * target.bottom;
  const rounder = model.top > 1.33 * target.top || model.bottom > 1.33 * target.bottom;
  let verdict = '';

  if (tighter) verdict = ': corners tighter than yours';
  else if (rounder) verdict = ': corners rounder than yours';

  return `Corner radius, top / bottom: yours about ${r(target.top)} / ${r(target.bottom)} mm, model ${r(model.top)} / ${r(model.bottom)} mm${verdict}.`;
}

function bandLine(b, flagMm) {
  const diff = b.modelMm - b.targetMm;
  let flag = '';

  if (Math.abs(diff) > flagMm) flag = diff < 0 ? '  ← model narrower' : '  ← model wider';

  return `${b.band * 10}–${(b.band + 1) * 10}%: ${r(b.targetMm)} → ${r(b.modelMm)} mm (${diff >= 0 ? '+' : '−'}${r(Math.abs(diff))})${flag}`;
}

export function targetText(name, view, fit) {
  const flagMm = Math.max(3, 0.05 * fit.targetSize[0]);

  return [
    `Target fit, ${view} view vs ${name}${fit.scaledToHeight ? " (scaled to the model's height: the outline has no mm size)" : ''}:`,
    `Overlap (IoU) ${fit.iou.toFixed(2)}. Size: yours ${r(fit.targetSize[0])} × ${r(fit.targetSize[1])} mm, model ${r(fit.modelSize[0])} × ${r(fit.modelSize[1])} mm.`,
    `Outline gap: mean ${fit.gapMeanMm.toFixed(1)} mm, worst ${r(fit.gapMaxMm)} mm.`,
    cornerLine(fit.corners),
    'Width per tenth of the height, top to bottom (yours → model):',
    ...fit.bands.filter((b) => b.targetMm > 0).map((b) => bandLine(b, flagMm)),
    'Overlay: red is the target only, blue is the model only, grey is both. Close the flagged bands and the corner radii first.',
  ].join('\n');
}

async function targetRequest(ref) {
  if (!ref.svg) return { reference: ref.dataUrl, masks: await photoMasks(ref.buf) };

  const { svg, heightMm } = normalizeSvg(ref.svg);

  return { reference: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, heightMm };
}

export async function targetReply({ ref, view = 'front', ids }) {
  const res = await bridge('target_compare', { ...(await targetRequest(ref)), view, ids }, 60000);

  if (!res?.fit) {
    return {
      content: [{ type: 'text', text: `No target fit for ${ref.name}: ${res?.reason ?? 'no outline found'}.` }],
    };
  }

  const content = [{ type: 'text', text: targetText(ref.name, res.view, res.fit) }];
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(res.overlay ?? '');

  if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });

  return { content };
}
