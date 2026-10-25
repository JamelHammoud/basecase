import { MAIN_MODULE, type GuideModule, type GuideStep } from '../guideTypes';
import type { StepDrawing } from '../render/guideDrawings';
import { artHtml, detailHtml, fit, turnHtml, type Rect } from './guideArt';
import { mirrorIcon, toolIcon } from './guideIcons';
import { box, esc, imageTag, mm, type GuideDoc } from './guideHtml';

const NUMBER_W = 21;
const TOOL = 13;
const TOOL_GAP = 3;
const ITEM = { w: 18, h: 19 };
const MODULE_ITEM = { w: 30, h: 25 };
const GAP_X = 2.6;
const GAP_Y = 1.4;
const PAD_X = 2.4;
const PAD_Y = 2;
const HALF_ASPECT = 1.25;
const PANEL_GAP = 8;

export interface StepPage {
  html: string;
  lastStep: number;
  module: string;
}

const MAIN_AREA: Rect = { x: 12, y: 12, w: 186, h: 258 };
const FRAME_AREA: Rect = { x: 16, y: 25, w: 178, h: 241 };

interface Panel {
  index: number;
  half: boolean;
}

function cellSize(key: string) {
  return key.startsWith('module:') ? MODULE_ITEM : ITEM;
}

function calloutRows(step: GuideStep, maxW: number): number[][] {
  const rows: number[][] = [[]];
  let used = PAD_X * 2;

  step.callout.forEach((c, i) => {
    const w = cellSize(c.key).w;

    if (rows.at(-1)!.length && used + GAP_X + w > maxW) {
      rows.push([]);
      used = PAD_X * 2;
    }

    used += (rows.at(-1)!.length ? GAP_X : 0) + w;
    rows.at(-1)!.push(i);
  });

  return rows;
}

function calloutHeight(step: GuideStep, rows: number[][]): number {
  const rowH = rows.map((r) => Math.max(...r.map((i) => cellSize(step.callout[i].key).h)));

  return rowH.reduce((a, b) => a + b, 0) + GAP_Y * (rows.length - 1) + PAD_Y * 2;
}

function calloutCell(doc: GuideDoc, entry: GuideStep['callout'][number]): string {
  if (entry.key.startsWith('module:')) {
    const id = entry.key.slice('module:'.length);
    const module = doc.plan.modules.find((m) => m.id === id);
    const art = doc.drawings.modules[id];

    return `<div class="ci module"><div class="thumb">${art ? imageTag(art.dataUrl) : ''}</div><div class="meta">${esc(module?.name ?? '')}</div></div>`;
  }

  const item = doc.plan.items.find((i) => i.key === entry.key);
  const thumb = doc.drawings.items[entry.key]?.thumb;

  return `<div class="ci"><div class="thumb">${thumb ? imageTag(thumb.dataUrl) : ''}</div><div class="meta"><span class="qty">${entry.qty}×</span>${item ? `<span class="tag">${item.label}</span>` : ''}</div></div>`;
}

function headerOf(doc: GuideDoc, step: GuideStep, area: Rect) {
  const tools = step.tools.map((id) => doc.plan.tools.find((t) => t.id === id)).filter((t) => !!t);
  const toolsW = tools.length ? tools.length * (TOOL + TOOL_GAP) : 0;
  const maxW = area.w - NUMBER_W - toolsW - 2;
  const rows = calloutRows(step, maxW);
  const height = step.callout.length ? calloutHeight(step, rows) : 0;
  const widest = Math.max(
    ...rows.map((r) => r.reduce((w, i, k) => w + cellSize(step.callout[i].key).w + (k ? GAP_X : 0), PAD_X * 2)),
  );
  const callout = step.callout.length
    ? `<div class="callout" style="${box(area.x + NUMBER_W, area.y, Math.min(widest, maxW), height)}">${step.callout
        .map((c) => calloutCell(doc, c))
        .join('')}</div>`
    : '';
  const toolHtml = tools
    .map(
      (t, i) =>
        `<div class="tool" style="left:${mm(area.x + area.w - (i + 1) * (TOOL + TOOL_GAP) + TOOL_GAP)};top:${mm(area.y)}">${toolIcon(t.icon)}${t.size ? `<span>${esc(t.size)}</span>` : ''}</div>`,
    )
    .join('');

  return { html: callout + toolHtml, height: Math.max(16, height), rows: rows.length };
}

function mirrorNote(doc: GuideDoc, step: GuideStep, area: Rect): string {
  const module = doc.plan.modules.find((m) => m.id === step.moduleId);
  const source = doc.plan.modules.find((m) => m.id === module?.repeatOf);

  return source
    ? `<div class="mirror-note" style="left:${mm(area.x)};top:${mm(area.y + area.h - 10)}">${mirrorIcon()}Build like ${esc(source.name)}, mirrored</div>`
    : '';
}

function panelHtml(doc: GuideDoc, index: number, area: Rect): { html: string; leader: string } {
  const step = doc.plan.steps[index];
  const drawing = doc.drawings.steps[index];
  const header = headerOf(doc, step, area);
  const top = header.height + 4;
  const artArea = { x: area.x, y: area.y + top, w: area.w, h: area.h - top - (step.kind === 'mirror' ? 12 : 0) };
  const rect = fit(drawing.main, artArea);
  const detail = drawing.detail ? detailHtml(drawing, rect, artArea) : null;
  const turn = drawing.view === 'front' ? '' : turnHtml(area.x + 1, area.y + 17);

  return {
    html:
      `<div class="num" style="left:${mm(area.x)};top:${mm(area.y)}">${step.number}</div>` +
      header.html +
      turn +
      artHtml(drawing.main, rect) +
      (detail?.html ?? '') +
      (step.kind === 'mirror' ? mirrorNote(doc, step, artArea) : ''),
    leader: detail?.leader ?? '',
  };
}

function isHalf(doc: GuideDoc, index: number, area: Rect): boolean {
  const d: StepDrawing = doc.drawings.steps[index];
  const header = headerOf(doc, doc.plan.steps[index], area);

  return d.main.width / d.main.height >= HALF_ASPECT && header.rows <= 2 && doc.plan.steps[index].kind !== 'mirror';
}

function packPanels(doc: GuideDoc, indices: number[], area: Rect): Panel[][] {
  const pages: Panel[][] = [];

  for (const index of indices) {
    const half = isHalf(doc, index, area);
    const last = pages.at(-1);

    if (half && last?.length === 1 && last[0].half) last.push({ index, half });
    else pages.push([{ index, half }]);
  }

  return pages;
}

function frameHtml(module: GuideModule): string {
  const times = module.copies > 1 ? `<span class="times">${module.copies}×</span>` : '';

  return `<div class="frame"></div><div class="frame-title">${esc(module.name)}${times}</div>`;
}

function pageOf(doc: GuideDoc, panels: Panel[], area: Rect, module: GuideModule): StepPage {
  const halfH = (area.h - PANEL_GAP) / 2;
  const rendered = panels.map((p, i) => {
    const y = p.half ? area.y + i * (halfH + PANEL_GAP) : area.y;

    return panelHtml(doc, p.index, { x: area.x, y, w: area.w, h: p.half ? halfH : area.h });
  });
  const leaders = rendered.map((r) => r.leader).join('');
  const overlay = leaders
    ? `<svg class="abs" style="left:0;top:0;width:210mm;height:297mm" viewBox="0 0 210 297">${leaders}</svg>`
    : '';
  const divider =
    panels.length === 2
      ? `<div class="abs" style="${box(area.x, area.y + halfH + PANEL_GAP / 2, area.w, 0.25)};background:#e3e3e3"></div>`
      : '';
  const framed = module.id !== MAIN_MODULE;

  return {
    html: (framed ? frameHtml(module) : '') + divider + rendered.map((r) => r.html).join('') + overlay,
    lastStep: panels.at(-1)!.index,
    module: module.id,
  };
}

export function stepPages(doc: GuideDoc): StepPage[] {
  const runs: number[][] = [];

  doc.plan.steps.forEach((s, i) => {
    const run = runs.at(-1);

    if (run && doc.plan.steps[run[0]].moduleId === s.moduleId) run.push(i);
    else runs.push([i]);
  });

  return runs.flatMap((run) => {
    const module = doc.plan.modules.find((m) => m.id === doc.plan.steps[run[0]].moduleId)!;
    const area = module.id === MAIN_MODULE ? MAIN_AREA : FRAME_AREA;

    return packPanels(doc, run, area).map((panels) => pageOf(doc, panels, area, module));
  });
}
