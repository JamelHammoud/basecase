import type { Drawing } from '../render/guideRenderer';
import type { StepDrawing } from '../render/guideDrawings';
import { rotateIcon } from './guideIcons';
import { box, imageTag, mm } from './guideHtml';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_ARROW_MM = 2.5;
const ARROW_STYLE = {
  part: { width: 0.7, halo: 1.7, head: 2.8, dash: '' },
  fastener: { width: 0.38, halo: 1.1, head: 1.9, dash: '1.8 1.2' },
};

export function fit(drawing: Pick<Drawing, 'width' | 'height'>, area: Rect, align: 'center' | 'top' = 'center'): Rect {
  const s = Math.min(area.w / drawing.width, area.h / drawing.height);
  const w = drawing.width * s;
  const h = drawing.height * s;

  return { x: area.x + (area.w - w) / 2, y: align === 'top' ? area.y : area.y + (area.h - h) / 2, w, h };
}

function arrowHead(to: [number, number], from: [number, number], size: number): string {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const ux = (to[0] - from[0]) / len;
  const uy = (to[1] - from[1]) / len;
  const bx = to[0] - ux * size;
  const by = to[1] - uy * size;
  const half = size * 0.45;

  return `${to[0]},${to[1]} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
}

function arrowsSvg(drawing: Drawing, pxPerMm: number): string {
  const parts = drawing.arrows.flatMap((a) => {
    const lengthMm = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) / pxPerMm;

    if (lengthMm < MIN_ARROW_MM) return [];

    const st = ARROW_STYLE[a.style];
    const k = pxPerMm;
    const dash = st.dash
      ? ` stroke-dasharray="${st.dash
          .split(' ')
          .map((v) => Number(v) * k)
          .join(' ')}"`
      : '';
    const d = `M${a.from[0]},${a.from[1]} L${a.to[0]},${a.to[1]}`;
    const head = arrowHead(a.to, a.from, st.head * k);

    return [
      `<path d="${d}" stroke="#fff" stroke-width="${st.halo * k}" stroke-linecap="round" fill="none"/>`,
      `<polygon points="${head}" fill="#fff" stroke="#fff" stroke-width="${(st.halo - st.width) * k}" stroke-linejoin="round"/>`,
      `<path d="${d}" stroke="#111" stroke-width="${st.width * k}" stroke-linecap="round" fill="none"${dash}/>`,
      `<polygon points="${head}" fill="#111"/>`,
    ];
  });

  return parts.length
    ? `<svg viewBox="0 0 ${drawing.width} ${drawing.height}" preserveAspectRatio="none">${parts.join('')}</svg>`
    : '';
}

export function artHtml(drawing: Drawing, rect: Rect): string {
  return `<div class="art" style="${box(rect.x, rect.y, rect.w, rect.h)}">${imageTag(drawing.dataUrl)}${arrowsSvg(drawing, drawing.width / rect.w)}</div>`;
}

export function turnHtml(x: number, y: number): string {
  return `<div class="turn" style="left:${mm(x)};top:${mm(y)}">${rotateIcon()}</div>`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function detailHtml(step: StepDrawing, art: Rect, area: Rect): { html: string; leader: string } {
  const detail = step.detail!;
  const d = clamp(Math.min(area.w, area.h) * 0.4, 34, 62);
  const anchor: [number, number] = [
    art.x + (detail.anchor[0] / step.main.width) * art.w,
    art.y + (detail.anchor[1] / step.main.height) * art.h,
  ];
  const right = { x: area.x + area.w - d - 1, y: area.y + 1 };
  const left = { x: area.x + 1, y: area.y + 1 };
  const anchorInRight = anchor[0] > right.x - 4 && anchor[1] < right.y + d + 4;
  const at = anchorInRight ? left : right;
  const inner = fit(detail, { x: d * 0.12, y: d * 0.12, w: d * 0.76, h: d * 0.76 });
  const cx = at.x + d / 2;
  const cy = at.y + d / 2;
  const dist = Math.hypot(anchor[0] - cx, anchor[1] - cy) || 1;
  const sx = cx + ((anchor[0] - cx) / dist) * (d / 2 + 1.2);
  const sy = cy + ((anchor[1] - cy) / dist) * (d / 2 + 1.2);

  return {
    html: `<div class="detail" style="${box(at.x, at.y, d, d)}">${artHtml(detail, inner)}</div>`,
    leader:
      dist > d / 2 + 3
        ? `<line x1="${sx}" y1="${sy}" x2="${anchor[0]}" y2="${anchor[1]}" stroke="#111" stroke-width="0.4"/><circle cx="${anchor[0]}" cy="${anchor[1]}" r="1" fill="#111" stroke="#fff" stroke-width="0.4"/>`
        : '',
  };
}
