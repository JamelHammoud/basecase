import { GUIDE_CSS } from './guideCss';
import { catalogueBodies, coverBody, introBody } from './guideFrontPages';
import { esc, imageTag, pageHtml, type GuideDoc } from './guideHtml';
import { checkMark } from './guideIcons';
import { stepPages } from './guideStepPages';

export interface GuideHtml {
  html: string;
  pages: number;
}

function doneBody(doc: GuideDoc): string {
  return `<div class="done-mark">${checkMark()}</div><div class="done">${imageTag(doc.drawings.cover.dataUrl)}</div>`;
}

export function guideHtml(doc: GuideDoc): GuideHtml {
  const catalogue = catalogueBodies(doc);
  const bodies: Array<{ body: string; className?: string; bare?: boolean }> = [
    { body: coverBody(doc), className: 'cover', bare: true },
    { body: introBody(doc, [3, 2 + catalogue.length]) },
    ...catalogue.map((body) => ({ body })),
    ...stepPages(doc).map((p) => ({
      body: p.html,
      className: p.module === 'main' ? 'steps' : 'steps frame-page',
    })),
    { body: doneBody(doc) },
  ];
  const pages = bodies.map((b, i) => pageHtml(b.body, i + 1, doc.meta, b));

  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.meta.title)} build guide</title><style>${GUIDE_CSS}</style></head><body>${pages.join('')}</body></html>`,
    pages: pages.length,
  };
}
