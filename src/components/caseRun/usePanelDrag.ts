import type React from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { MAX_AREAS, type CaseConsole } from '../../cases/console/format';
import type { PanelDrop } from '../../cases/console/layoutEdits';
import type { PanelSpec } from '../../cases/console/panelKinds';
import { dropAt, grabsPanel, sameDrop } from './panelDrop';

export interface PanelDrag {
  panel: PanelSpec;
  drop: PanelDrop | null;
}

interface Press {
  panel: PanelSpec;
  handle: HTMLElement;
  pointer: number;
  x: number;
  y: number;
  moving: boolean;
  drop: PanelDrop | null;
}

const THRESHOLD = 4;

const aloneIn = (c: CaseConsole, id: string) =>
  c.layout.areas.some((a) => 'panels' in a && a.panels.length === 1 && a.panels[0] === id);

export function usePanelDrag(caseConsole: CaseConsole, onDrop: (id: string, drop: PanelDrop) => void) {
  const [drag, setDrag] = useState<PanelDrag | null>(null);
  const [pressing, setPressing] = useState(false);
  const pressRef = useRef<Press | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);

  const moved = useEffectEvent((e: PointerEvent) => {
    const press = pressRef.current;

    if (!press) return;

    if (!press.moving && Math.hypot(e.clientX - press.x, e.clientY - press.y) < THRESHOLD) return;

    const columns = caseConsole.layout.areas.length < MAX_AREAS || aloneIn(caseConsole, press.panel.id);
    const drop = dropAt(e.clientX, e.clientY, columns);

    chipRef.current?.style.setProperty('transform', `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`);

    if (press.moving && sameDrop(press.drop, drop)) return;

    press.moving = true;
    press.drop = drop;
    document.body.style.cursor = 'grabbing';
    setDrag({ panel: press.panel, drop });
  });

  const ended = useEffectEvent((commit: boolean) => {
    const press = pressRef.current;

    pressRef.current = null;

    if (press?.handle.hasPointerCapture(press.pointer)) press.handle.releasePointerCapture(press.pointer);

    setPressing(false);
    setDrag(null);
    document.body.style.cursor = '';

    if (commit && press?.moving && press.drop) onDrop(press.panel.id, press.drop);
  });

  useEffect(() => {
    if (!pressing) return;

    const move = (e: PointerEvent) => moved(e);
    const up = () => ended(true);
    const lost = () => ended(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      e.stopPropagation();
      ended(false);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('lostpointercapture', lost);
    window.addEventListener('keydown', key, true);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('lostpointercapture', lost);
      window.removeEventListener('keydown', key, true);
    };
  }, [pressing]);

  const start = (e: React.PointerEvent<HTMLElement>, panel: PanelSpec) => {
    if (e.button !== 0 || !grabsPanel(e, e.currentTarget, panel)) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pressRef.current = {
      panel,
      handle: e.currentTarget,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moving: false,
      drop: null,
    };
    setPressing(true);
  };

  return { drag, start, chipRef };
}
