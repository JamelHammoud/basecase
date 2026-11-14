import type { PanelDrop } from '../../cases/console/layoutEdits';

export const COLUMN_EDGE = 32;

const HANDLE_TITLED = 40;
const HANDLE_BARE = 12;

const INTERACTIVE = 'button, input, select, textarea, a, canvas, iframe, [role=slider], [role=separator]';

export function grabsPanel(e: { target: EventTarget; clientY: number }, wrapper: HTMLElement, titled: boolean) {
  const target = e.target as Element;

  if (target.closest(INTERACTIVE)) return false;

  return e.clientY - wrapper.getBoundingClientRect().top <= (titled ? HANDLE_TITLED : HANDLE_BARE);
}

const shown = (el: Element) => (el as HTMLElement).offsetHeight > 0;

function edgeDrop(el: HTMLElement | undefined): PanelDrop | null {
  const column = el?.dataset.consoleEdge;

  if (column !== 'before' && column !== 'after') return null;

  return { area: Number(el!.dataset.area), column };
}

function areaDrop(area: HTMLElement, x: number, y: number, columns: boolean): PanelDrop {
  const at = Number(area.dataset.consoleArea);
  const card = (area.querySelector('[data-console-card]') ?? area).getBoundingClientRect();

  if (columns && x - card.left < COLUMN_EDGE) return { area: at, column: 'before' };

  if (columns && card.right - x < COLUMN_EDGE) return { area: at, column: 'after' };

  const below = [...area.querySelectorAll<HTMLElement>('[data-panel]')].filter(shown).find((el) => {
    const r = el.getBoundingClientRect();

    return r.top + r.height / 2 > y;
  });

  return below ? { area: at, before: below.dataset.panel } : { area: at };
}

export function dropAt(x: number, y: number, columns: boolean): PanelDrop | null {
  const under = document.elementsFromPoint(x, y) as HTMLElement[];
  const edge = columns ? edgeDrop(under.find((el) => el.dataset.consoleEdge)) : null;

  if (edge) return edge;

  const area = under.map((el) => el.closest<HTMLElement>('[data-console-area]')).find(Boolean);

  return area ? areaDrop(area, x, y, columns) : null;
}

export const sameDrop = (a: PanelDrop | null, b: PanelDrop | null) => JSON.stringify(a) === JSON.stringify(b);
