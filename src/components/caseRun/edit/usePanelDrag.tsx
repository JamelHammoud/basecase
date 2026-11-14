import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PanelDrop } from '../../../cases/console/consoleEdits';
import { areaBoxes, dropAt, type DropAt } from './dropTarget';

const THRESHOLD = 4;
const EDGE_GRIP = 8;
const HEADER_GRIP = 56;
const CONTROLS = 'button, input, textarea, select, a, [role=slider], [role=separator]';

interface Pending {
  id: string;
  x: number;
  y: number;
  moved: boolean;
}

export function gripsPanel(target: Element, panel: HTMLElement, y: number) {
  const fromTop = y - panel.getBoundingClientRect().top;

  if (fromTop < EDGE_GRIP) return true;

  const header = target.closest('header');

  return (
    !!header && header.parentElement?.parentElement === panel && fromTop < HEADER_GRIP && !target.closest(CONTROLS)
  );
}

interface DropRules {
  accepts: (id: string, drop: PanelDrop) => boolean;
  onDrop: (id: string, drop: PanelDrop) => void;
}

const acceptedAt = (rules: DropRules, id: string, e: React.PointerEvent) => {
  const at = dropAt(areaBoxes(document), e.clientX, e.clientY);

  return at && rules.accepts(id, at.drop) ? at : null;
};

export function usePanelDrag(rules: DropRules) {
  const pending = useRef<Pending | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<DropAt | null>(null);

  const end = (el: HTMLElement, pointerId: number) => {
    pending.current = null;
    setDragging(null);
    setTarget(null);
    document.body.style.cursor = '';

    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const panel = (e.target as Element).closest<HTMLElement>('[data-panel]');

    if (e.button !== 0 || !panel || !gripsPanel(e.target as Element, panel, e.clientY)) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pending.current = { id: panel.dataset.panel ?? '', x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const p = pending.current;

    if (!p) return;

    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < THRESHOLD) return;

    if (!p.moved) {
      p.moved = true;
      setDragging(p.id);
      document.body.style.cursor = 'grabbing';
    }

    setTarget(acceptedAt(rules, p.id, e));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const p = pending.current;
    const drop = p?.moved ? acceptedAt(rules, p.id, e) : null;

    end(e.currentTarget, e.pointerId);

    if (p && drop) rules.onDrop(p.id, drop.drop);
  };

  const line = target?.line;
  const indicator =
    dragging && line
      ? createPortal(
          <div
            data-testid="panel-drop"
            className="fixed z-[90] rounded-full bg-[#0d99ff] pointer-events-none"
            style={{ left: line.x, top: line.y, width: line.width, height: line.height }}
          />,
          document.body,
        )
      : null;

  return {
    dragging,
    indicator,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e.currentTarget, e.pointerId),
    },
  };
}
