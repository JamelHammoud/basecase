import type { GuidePlan } from '../guideTypes';
import type { GuideDrawings } from '../render/guideDrawings';

export interface GuideMeta {
  title: string;
  material: string;
  infillPct: number;
  date: string;
  sizeMm?: [number, number, number];
  mark: string;
}

export interface GuideDoc {
  plan: GuidePlan;
  drawings: GuideDrawings;
  meta: GuideMeta;
}

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 12;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const CONTENT_TOP = 14;
export const CONTENT_BOTTOM = PAGE_H - 30;

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const mm = (v: number) => `${Math.round(v * 100) / 100}mm`;

export const box = (x: number, y: number, w: number, h: number) =>
  `left:${mm(x)};top:${mm(y)};width:${mm(w)};height:${mm(h)}`;

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface PageOptions {
  className?: string;
  bare?: boolean;
}

export function pageHtml(body: string, folio: number, meta: GuideMeta, options: PageOptions = {}): string {
  const parity = folio % 2 === 0 ? 'even' : 'odd';
  const footer = options.bare
    ? ''
    : `<div class="footer"><div class="title">${esc(meta.title)}</div><div class="folio">${folio}</div></div>`;

  return `<section class="page ${parity} ${options.className ?? ''}">${body}${footer}</section>`;
}

export function imageTag(dataUrl: string, style = ''): string {
  return `<img src="${dataUrl}" alt=""${style ? ` style="${style}"` : ''}>`;
}
