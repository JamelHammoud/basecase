import type { GuidePages } from './guidePages';

export const PAGE_W_PX = (210 / 25.4) * 96;
export const PAGE_H_PX = (297 / 25.4) * 96;

const VIEWER_CSS = `
:host { all: initial; display: block; }
.zoom {
  zoom: var(--guide-k, 1);
  width: 210mm;
  height: 297mm;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #111;
  font-variant-numeric: tabular-nums;
}
.zoom > .page { margin: 0 !important; box-shadow: none !important; }
`;

const DECODE_WAIT_MS = 350;

const sheets = new Map<string, CSSStyleSheet>();

function sheetFor(guide: GuidePages): CSSStyleSheet {
  const known = sheets.get(guide.key);

  if (known) return known;

  const sheet = new CSSStyleSheet();

  sheet.replaceSync(`${guide.css.replace(/@page[^}]*}/g, '')}\n${VIEWER_CSS}`);
  sheets.clear();
  sheets.set(guide.key, sheet);

  return sheet;
}

function makeSlot(page: HTMLElement, sheet: CSSStyleSheet, index: number): HTMLElement {
  const slot = document.createElement('div');
  const shadow = slot.attachShadow({ mode: 'open' });
  const zoom = document.createElement('div');

  slot.className = 'guide-slot';
  slot.dataset.page = String(index);
  shadow.adoptedStyleSheets = [sheet];
  zoom.className = 'zoom';
  zoom.append(page);
  shadow.append(zoom);

  return slot;
}

export function pageCopy(guide: GuidePages, index: number): HTMLElement | null {
  const page = guide.pages[index];

  return page ? makeSlot(page.cloneNode(true) as HTMLElement, sheetFor(guide), index) : null;
}

function decoded(slot: HTMLElement): Promise<unknown> {
  const images = [...(slot.shadowRoot?.querySelectorAll('img') ?? [])];

  return Promise.all(images.map((img) => img.decode().catch(() => undefined)));
}

export interface PageAnchor {
  slot: HTMLElement;
  fx: number;
  fy: number;
}

export class GuidePageStack {
  readonly slots: HTMLElement[];

  constructor(container: HTMLElement, guide: GuidePages) {
    const sheet = sheetFor(guide);

    this.slots = guide.pages.map((page, i) => makeSlot(page, sheet, i));
    container.append(...this.slots);
  }

  ready(count = 2): Promise<unknown> {
    const wait = new Promise((resolve) => setTimeout(resolve, DECODE_WAIT_MS));

    return Promise.race([Promise.all(this.slots.slice(0, count).map(decoded)), wait]);
  }

  nearestToCenter(view: DOMRect): HTMLElement | undefined {
    const middle = view.top + view.height / 2;
    const distance = (slot: HTMLElement) => {
      const r = slot.getBoundingClientRect();

      return Math.abs(r.top + r.height / 2 - middle);
    };

    return this.slots.reduce<HTMLElement | undefined>(
      (best, slot) => (!best || distance(slot) < distance(best) ? slot : best),
      undefined,
    );
  }

  anchorAt(point: { x: number; y: number }): PageAnchor | undefined {
    const view = new DOMRect(point.x, point.y, 0, 0);
    const slot = this.nearestToCenter(view);
    const r = slot?.getBoundingClientRect();

    if (!slot || !r?.width) return undefined;

    return { slot, fx: (point.x - r.left) / r.width, fy: (point.y - r.top) / r.height };
  }

  dispose() {
    this.slots.forEach((slot) => slot.remove());
  }
}
