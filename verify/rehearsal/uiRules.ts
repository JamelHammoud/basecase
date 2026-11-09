import type { Page } from 'playwright-core';

export interface Violation {
  rule: string;
  where: string;
}

export const UI_BARS = Object.freeze({ controlPx: 32, iconButtonPx: 28, typePx: 12, greyChroma: 24 });

export const BANNED_COPY: ReadonlyArray<[string, string]> = Object.freeze([
  ['\\byet\\b', 'i'],
  ['\\bplease\\b', 'i'],
  ['\\bsimply\\b', 'i'],
  ['\\bjust\\b', 'i'],
  ['\\beasily\\b', 'i'],
  ['\\bsuccessfully\\b', 'i'],
  ['\\boops\\b', 'i'],
  ['\\buh-oh\\b', 'i'],
  ['\\binvalid\\b', 'i'],
  ['\\berror:', 'i'],
  ['will appear here|show up here', 'i'],
  ['tried in simulation only', 'i'],
  ['\\bclick here\\b', 'i'],
  ['^learn more$', 'i'],
  ['\\bwe\\b', 'i'],
  ['^your\\b', 'i'],
  [' [·•|] ', ''],
]);

const EXEMPT = 'kbd, [data-keycap], [data-user-content], [contenteditable="true"], canvas, svg, img, video';

export async function installHelpers(page: Page) {
  await page.evaluate((exempt) => {
    const w = window as unknown as Record<string, unknown>;

    w.__gateShown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const hidden = s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0;

      return r.width > 0 && r.height > 0 && !hidden && !el.closest('[inert], [aria-hidden="true"]');
    };
    w.__gateExempt = (el: Element) => Boolean(el.closest(exempt));
    w.__gateName = (el: Element) =>
      `${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}”`;
  }, EXEMPT);
}

export function scanControls(page: Page, bars = UI_BARS): Promise<Violation[]> {
  return page.evaluate((b) => {
    const w = window as unknown as Record<string, (el: Element) => unknown>;
    const out: Array<{ rule: string; where: string }> = [];
    const fields =
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea, [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option]';

    for (const el of document.querySelectorAll(`${fields}, button, [role=button]`)) {
      if (!w.__gateShown(el) || w.__gateExempt(el)) continue;

      const height = el.getBoundingClientRect().height;
      const field = el.matches(fields);
      const iconOnly = !field && !(el.textContent ?? '').trim();
      const need = field || !iconOnly ? b.controlPx : b.iconButtonPx;

      if (height + 0.5 < need)
        out.push({ rule: `${need}px controls`, where: `${w.__gateName(el)} is ${height.toFixed(1)}px` });
    }

    return out;
  }, bars);
}

export function scanType(page: Page, bars = UI_BARS): Promise<Violation[]> {
  return page.evaluate((b) => {
    const w = window as unknown as Record<string, (el: Element) => unknown>;
    const out: Array<{ rule: string; where: string }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;

      if (!el || !(node.textContent ?? '').trim() || !w.__gateShown(el) || w.__gateExempt(el)) continue;

      const size = parseFloat(getComputedStyle(el).fontSize);

      if (size + 0.01 < b.typePx) out.push({ rule: '12px type', where: `${w.__gateName(el)} is ${size}px` });
    }

    return out;
  }, bars);
}

export function scanGreys(page: Page, bars = UI_BARS): Promise<Violation[]> {
  return page.evaluate((b) => {
    const w = window as unknown as Record<string, (el: Element) => unknown>;
    const out: Array<{ rule: string; where: string }> = [];
    const tinted = (value: string) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(value);

      if (!m || Number(m[4] ?? 1) === 0) return false;

      const [r, g, bl] = [m[1], m[2], m[3]].map(Number);
      const chroma = Math.max(r, g, bl) - Math.min(r, g, bl);

      return chroma > 0 && chroma <= b.greyChroma;
    };

    for (const el of document.querySelectorAll('body *')) {
      if (!w.__gateShown(el) || w.__gateExempt(el)) continue;

      const s = getComputedStyle(el);
      const borders = s.borderTopWidth !== '0px' ? [s.borderTopColor] : [];
      const bad = [s.color, s.backgroundColor, ...borders].find(tinted);

      if (bad) out.push({ rule: 'neutral greys', where: `${w.__gateName(el)} uses ${bad}` });
    }

    return out;
  }, bars);
}

export function scanCopy(page: Page, banned = BANNED_COPY): Promise<Violation[]> {
  return page.evaluate((patterns) => {
    const w = window as unknown as Record<string, (el: Element) => unknown>;
    const out: Array<{ rule: string; where: string }> = [];
    const rules = patterns.map(([source, flags]) => new RegExp(source, flags));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const text = (node.textContent ?? '').trim();
      const field = el?.closest('textarea, input, [data-user-content], [contenteditable="true"]');

      if (!el || !text || field || !w.__gateShown(el)) continue;

      const hit = rules.find((r) => r.test(text));

      if (hit) out.push({ rule: 'copy lint', where: `“${text.slice(0, 60)}” matches ${hit.source}` });
    }

    return out;
  }, banned);
}

export async function scanAxe(page: Page, axePath: string): Promise<Violation[]> {
  await page.addScriptTag({ path: axePath });

  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe;
    const result = (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })) as {
      violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }>;
    };

    return result.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .flatMap((v) => v.nodes.map((n) => ({ rule: `axe ${v.id}`, where: n.target.join(' ') })));
  });
}

export const dedupe = (violations: Violation[]) => [
  ...new Map(violations.map((v) => [`${v.rule}|${v.where}`, v])).values(),
];
