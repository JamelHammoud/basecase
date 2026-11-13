import type { Page } from 'playwright-core';

export const FAULT_KINDS = Object.freeze([
  'label-removed',
  'tiny',
  'dead-click',
  'misleading-label',
  'low-contrast',
  'slow-response',
  'jargon-error',
  'disabled-silently',
  'jumpy',
  'flicker',
] as const);

export type FaultKind = (typeof FAULT_KINDS)[number];

export interface FaultSpec {
  kind: FaultKind;
  name: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TARGETS =
  'button:not(nav[aria-label="Sidebar views"] *), [role=tab], [role=menuitem], [role=switch], [role=checkbox]';

export function namedControls(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const name = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();

    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect();

        return r.width > 0 && r.height > 0 && !el.closest('[inert]') && name(el).length > 1;
      })
      .map(name);
  }, TARGETS);
}

export function plantFaults(page: Page, specs: FaultSpec[]): Promise<void> {
  return page.evaluate(
    ({ list, selector }) => {
      const label = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
      const done = new WeakSet<Element>();
      const rects: Record<string, DOMRect[]> = {};
      const sameRect = (a: DOMRect, b: DOMRect) =>
        Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4 && Math.abs(a.width - b.width) < 4;
      const remember = (name: string, rect: DOMRect) => {
        const seen = (rects[name] ??= []);

        if (rect.width > 0 && seen.length < 40 && !seen.some((r) => sameRect(r, rect))) seen.push(rect);
      };
      const swallow = (el: HTMLElement) =>
        el.addEventListener('click', (e) => (e.stopImmediatePropagation(), e.preventDefault()), true);
      const apply: Record<string, (el: HTMLElement) => void> = {
        'label-removed': (el) => ((el.textContent = ''), el.setAttribute('aria-label', '')),
        tiny: (el) => Object.assign(el.style, { height: '14px', fontSize: '9px', minHeight: '0' }),
        'dead-click': swallow,
        'misleading-label': (el) => (el.textContent = 'Delete Everything'),
        'low-contrast': (el) => Object.assign(el.style, { color: '#262626', background: '#222222' }),
        'slow-response': (el) => {
          el.addEventListener(
            'click',
            (e) => {
              if ((e as MouseEvent & { gateLate?: boolean }).gateLate) return;

              e.stopImmediatePropagation();
              setTimeout(
                () => el.dispatchEvent(Object.assign(new MouseEvent('click', { bubbles: true }), { gateLate: true })),
                8000,
              );
            },
            true,
          );
        },
        'jargon-error': (el) => {
          swallow(el);
          el.addEventListener('click', () => {
            const note = document.createElement('div');

            note.textContent = 'ERR_0x3F: EINVAL in handler';
            Object.assign(note.style, {
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              color: '#fff',
              background: '#111',
              padding: '8px',
            });
            document.body.append(note);
          });
        },
        'disabled-silently': (el) => (
          el.setAttribute('aria-disabled', 'true'),
          (el.style.pointerEvents = 'none'),
          (el.style.opacity = '0.35')
        ),
        jumpy: (el) =>
          el.addEventListener(
            'mouseenter',
            () => (el.style.transform = `translate(${40 + Math.random() * 60}px, 30px)`),
          ),
        flicker: (el) =>
          setInterval(() => (el.style.visibility = el.style.visibility === 'hidden' ? '' : 'hidden'), 700),
      };
      const held = new Map<string, HTMLElement>();
      const locate = (name: string) => {
        const known = held.get(name);

        if (known?.isConnected) return known;

        return [...document.querySelectorAll<HTMLElement>(selector)].find((x) => !done.has(x) && label(x) === name);
      };
      const tick = () => {
        for (const spec of list) {
          const el = locate(spec.name);

          if (!el) continue;

          remember(spec.name, el.getBoundingClientRect());

          if (!done.has(el)) {
            done.add(el);
            held.set(spec.name, el);
            apply[spec.kind](el);
          }
        }
      };

      (window as unknown as { __gateFaultRects: unknown }).__gateFaultRects = rects;
      tick();
      setInterval(tick, 250);
    },
    { list: specs, selector: TARGETS },
  );
}

export const faultRects = (page: Page): Promise<Record<string, Rect[]>> =>
  page.evaluate(() => {
    const seen = (window as unknown as { __gateFaultRects?: Record<string, DOMRect[]> }).__gateFaultRects ?? {};

    return Object.fromEntries(
      Object.entries(seen).map(([name, list]) => [
        name,
        list.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
      ]),
    );
  });
