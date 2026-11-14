import { useState } from 'react';
import type { PanelPlace } from '../../cases/console/consoleEdits';
import { dropMark, dropPlace, inFlow, type AreaBox, type DropGeometry, type DropMark } from './panelDrop';

const START_PX = 4;

const AREA = '[data-testid="case-run-area"][data-area]';

function boxOf(el: Element) {
  const { left, right, top, bottom } = el.getBoundingClientRect();

  return { left, right, top, bottom };
}

function areaBox(el: HTMLElement): AreaBox {
  const box = boxOf(el);
  const panels = [...el.querySelectorAll<HTMLElement>('[data-testid="case-run-panel"]')].map((p) => ({
    id: p.dataset.panel ?? '',
    ...boxOf(p),
  }));

  return { at: Number(el.dataset.area), ...box, panels: inFlow(panels, box.top) };
}

function measure(root: Element, canvasAt: number): DropGeometry {
  const canvas = root.querySelector('[data-canvas-card]');

  return {
    areas: [...root.querySelectorAll<HTMLElement>(AREA)].map(areaBox),
    canvas: canvas ? { at: canvasAt, ...boxOf(canvas) } : null,
  };
}

interface Drag {
  id: string;
  mark: DropMark | null;
}

export function usePanelDrag(canvasAt: number, onDrop: (id: string, place: PanelPlace) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);

  const start = (e: React.PointerEvent<HTMLElement>, id: string) => {
    const root = e.currentTarget.closest(AREA)?.parentElement;

    if (e.button !== 0 || !root) return;

    e.preventDefault();

    const from = { x: e.clientX, y: e.clientY };
    let place: PanelPlace | null = null;
    let moved = false;

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < START_PX) return;

      moved = true;
      document.body.style.cursor = 'grabbing';

      const geometry = measure(root, canvasAt);

      place = dropPlace(geometry, ev.clientX, ev.clientY);
      setDrag({ id, mark: place && dropMark(geometry, place) });
    };

    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.style.cursor = '';
      setDrag(null);

      if (ev.type === 'pointerup' && moved && place) onDrop(id, place);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return { dragging: drag?.id ?? null, mark: drag?.mark ?? null, start };
}
