import React, { useEffect, useRef } from 'react';
import type { Viewport3DHandle } from './Viewport3D';
import { AGENT_COLOR, ARROW_PATH } from '../design-system';
import { watchCursor } from './cursorMotion';

interface AgentCursorProps {
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  target: [number, number, number] | null;
  visible: boolean;
  action?: string;
  name?: string;
  color?: string;
}

export const AgentCursor: React.FC<AgentCursorProps> = ({
  viewportRef,
  target,
  visible,
  action,
  name = 'Agent',
  color = AGENT_COLOR,
}) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const element = elRef.current;
    const viewport = viewportRef.current;

    if (!element || !viewport) return;

    return watchCursor(viewport, element, { target, visible, position: posRef });
  }, [viewportRef, target, visible]);

  return (
    <div
      ref={elRef}
      aria-hidden
      className={`absolute left-0 top-0 z-[16] pointer-events-none transition-opacity duration-300 ${
        visible && target ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
        <path d={ARROW_PATH} fill={color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div
        className="absolute left-4 top-[18px] flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full rounded-tl-[4px] text-[12px] font-medium text-white whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
        style={{ background: color }}
      >
        <span>{name}</span>
        {action && <span className="text-white/90 font-normal max-w-[220px] truncate">{action}</span>}
      </div>
    </div>
  );
};
