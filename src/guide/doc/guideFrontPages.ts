import type { GuideItem } from '../guideTypes';
import { checkMark, crossMark, layoutPictogram, overtightPictogram, snugPictogram, toolIcon } from './guideIcons';
import { CONTENT_BOTTOM, CONTENT_TOP, esc, imageTag, mm, plural, type GuideDoc } from './guideHtml';

export function coverBody({ plan, drawings, meta }: GuideDoc): string {
  const size = meta.sizeMm
    ? `<div class="fact"><div class="v">${meta.sizeMm.map((v) => Math.round(v)).join(' × ')}<small>mm</small></div><div class="k">Size</div></div>`
    : '';
  const parts = plan.items.reduce((n, i) => n + i.qty, 0);
  const steps = plan.steps.filter((s) => s.moduleId === 'main').length;

  return `
<div class="kicker">Build guide</div>
<div class="name">${esc(meta.title)}</div>
<div class="hero">${imageTag(drawings.cover.dataUrl)}</div>
<div class="facts">
  <div class="fact"><div class="v">${parts}</div><div class="k">Parts</div></div>
  <div class="fact"><div class="v">${plan.steps.length}</div><div class="k">Steps</div></div>
  ${steps === plan.steps.length ? '' : `<div class="fact"><div class="v">${plan.modules.length - 1}</div><div class="k">Sub-assemblies</div></div>`}
  ${size}
</div>
<div class="brand">${meta.mark}Basecase</div>
<div class="date">${esc(meta.date)}</div>`;
}

function pictograms(doc: GuideDoc): string {
  const printed = doc.plan.items.filter((i) => i.kind === 'printed').reduce((n, i) => n + i.qty, 0);
  const inserts = doc.plan.items.filter((i) => i.hardware?.type === 'heat_insert').reduce((n, i) => n + i.qty, 0);
  const screws = doc.plan.items.some((i) => i.kind === 'hardware' && i.hardware?.type !== 'heat_insert');
  const panels = [
    printed ? [toolIcon('printer'), `Print ${plural(printed, 'part', 'parts')} in ${esc(doc.meta.material)}`] : null,
    [layoutPictogram(), 'Lay out every part and check it against the catalogue'],
    inserts
      ? [toolIcon('soldering-iron'), `Press ${plural(inserts, 'insert', 'inserts')} in with a soldering iron`]
      : null,
    screws
      ? [
          `<div class="pair">${snugPictogram()}${checkMark()}</div><div class="pair">${overtightPictogram()}${crossMark()}</div>`,
          'Tighten screws until snug. Printed plastic strips.',
        ]
      : null,
  ].filter((p): p is string[] => !!p);

  return panels
    .map(([art, cap]) => `<div class="pic"><div class="art">${art}</div><div class="cap">${cap}</div></div>`)
    .join('');
}

export function introBody(doc: GuideDoc): string {
  const tools = doc.plan.tools
    .map((t) => `<div class="tool-card">${toolIcon(t.icon)}<div>${esc(t.name)}</div></div>`)
    .join('');

  return `
<div class="sheet">
  <div class="h">Before you start</div>
  <div class="panels">${pictograms(doc)}</div>
  ${tools ? `<div class="h2" style="margin-top:10mm">Tools</div><div class="tools-grid">${tools}</div>` : ''}
</div>`;
}

type Block = { height: number; html: string };

const CARD_ROW = 52;
const SECTION_HEAD = 10;
const TITLE_HEIGHT = 16;
const RULER_HEIGHT = 16;

function cardHtml(doc: GuideDoc, item: GuideItem): string {
  const thumb = doc.drawings.items[item.key]?.thumb;

  return `<div class="card"><div class="row"><span class="tag">${item.label}</span><span class="qty">${item.qty}×</span></div><div class="img">${thumb ? imageTag(thumb.dataUrl) : ''}</div><div class="name">${esc(item.name)}${item.detail ? `<br><span style="color:#8a8a8a">${esc(item.detail)}</span>` : ''}</div></div>`;
}

function cardBlocks(doc: GuideDoc, items: GuideItem[], title: string, note: string): Block[] {
  if (!items.length) return [];

  const rows: Block[] = [];

  for (let i = 0; i < items.length; i += 4) {
    rows.push({
      height: CARD_ROW,
      html: `<div class="grid" style="margin-bottom:4mm">${items
        .slice(i, i + 4)
        .map((it) => cardHtml(doc, it))
        .join('')}</div>`,
    });
  }

  return [{ height: SECTION_HEAD, html: `<div class="h2">${title}<span>${note}</span></div>` }, ...rows];
}

function ruler(lengthMm: number): string {
  const ticks: string[] = [];

  for (let i = 0; i <= lengthMm; i++) {
    const h = (i % 10 === 0 && 4) || (i % 5 === 0 && 2.6) || 1.5;

    ticks.push(
      `<line x1="${i}" y1="0" x2="${i}" y2="${h}" stroke="#111" stroke-width="${i % 10 === 0 ? 0.25 : 0.15}"/>`,
    );

    if (i % 10 === 0) ticks.push(`<text x="${i}" y="7.6" font-size="2.6" text-anchor="middle" fill="#111">${i}</text>`);
  }

  return `<svg class="ruler" viewBox="-1 0 ${lengthMm + 2} 9" style="width:${mm(lengthMm + 2)};height:9mm"><line x1="0" y1="0" x2="${lengthMm}" y2="0" stroke="#111" stroke-width="0.3"/>${ticks.join('')}</svg>`;
}

function hardwareBlocks(doc: GuideDoc, items: GuideItem[]): Block[] {
  if (!items.length) return [];

  const rows = items.map((item) => {
    const actual = doc.drawings.items[item.key]?.actual;
    const image = actual ? imageTag(actual.dataUrl, `width:${mm(actual.widthMm)};height:${mm(actual.heightMm)}`) : '';
    const height = Math.max(9, actual?.heightMm ?? 9) + 4.6;

    return {
      height,
      html: `<div class="hw"><div class="actual">${image}</div><span class="tag">${item.label}</span><span class="qty">${item.qty}×</span><div class="name">${esc(item.name)}${item.detail ? `<span>${esc(item.detail)}</span>` : ''}</div></div>`,
    };
  });

  return [
    { height: SECTION_HEAD, html: `<div class="h2">Hardware<span>Actual size at 100% print scale</span></div>` },
    { height: RULER_HEIGHT, html: ruler(100) },
    ...rows,
  ];
}

function paginate(blocks: Block[], firstOffset: number): string[] {
  const pages: string[][] = [[]];
  let used = firstOffset;
  const capacity = CONTENT_BOTTOM - CONTENT_TOP;

  for (const b of blocks) {
    if (used + b.height > capacity && pages.at(-1)!.length) {
      pages.push([]);
      used = 0;
    }

    pages.at(-1)!.push(b.html);
    used += b.height;
  }

  return pages.map((p) => p.join(''));
}

export function catalogueBodies(doc: GuideDoc): string[] {
  const printed = doc.plan.items.filter((i) => i.kind === 'printed');
  const bought = doc.plan.items.filter((i) => i.kind === 'bought');
  const hardware = doc.plan.items.filter((i) => i.kind === 'hardware');
  const printedQty = printed.reduce((n, i) => n + i.qty, 0);
  const blocks = [
    ...cardBlocks(doc, printed, 'Printed parts', `${plural(printedQty, 'part', 'parts')} · ${esc(doc.meta.material)}`),
    ...cardBlocks(
      doc,
      bought,
      'Bought parts',
      plural(
        bought.reduce((n, i) => n + i.qty, 0),
        'part',
        'parts',
      ),
    ),
  ];
  const parts = paginate(blocks, TITLE_HEIGHT).map(
    (html, i) =>
      `<div class="sheet">${i === 0 ? `<div class="h" style="margin-bottom:7mm">Parts</div>` : ''}${html}</div>`,
  );
  const hw = paginate(hardwareBlocks(doc, hardware), 0).map((html) => `<div class="sheet">${html}</div>`);

  return [...parts, ...hw];
}
