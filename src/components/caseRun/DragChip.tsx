import React from 'react';
import { panelName } from '../../cases/console/panelNames';
import type { PanelDrag } from './usePanelDrag';

export function DragChip({
  chipRef,
  drag,
}: {
  chipRef: React.RefObject<HTMLDivElement | null>;
  drag: PanelDrag | null;
}) {
  return (
    <div
      ref={chipRef}
      aria-hidden
      className={`pointer-events-none fixed left-0 top-0 z-[80] h-[28px] max-w-[240px] truncate rounded-[8px] bg-[#2c2c2c] px-[10px] text-[13px] leading-[28px] text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
        drag ? '' : 'hidden'
      }`}
    >
      {drag && panelName(drag.panel)}
    </div>
  );
}

export function CanvasEdge({ side, area, active }: { side: 'before' | 'after'; area: number; active: boolean }) {
  return (
    <div className="relative w-0 shrink-0">
      <div
        data-console-edge={side}
        data-area={area}
        className={`absolute top-0 bottom-0 z-40 w-[40px] ${side === 'before' ? 'left-0' : 'right-0'}`}
      >
        {active && (
          <span
            data-testid="console-drop"
            className={`pointer-events-none absolute top-[12px] bottom-[12px] w-[2px] rounded-full bg-[#0d99ff] ${
              side === 'before' ? 'left-[11px]' : 'right-[11px]'
            }`}
          />
        )}
      </div>
    </div>
  );
}
