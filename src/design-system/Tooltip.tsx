import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from './Kbd';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: React.ReactNode;
  shortcut?: string;
  side?: TooltipSide;
  children: React.ReactElement;
  disabled?: boolean;
  /** Classes for the anchor wrapper, e.g. "flex-1" when wrapping a stretching control */
  className?: string;
}

// macOS behaviour: first tooltip waits, neighbours appear instantly while "warm".
const OPEN_DELAY_MS = 500;
const WARM_WINDOW_MS = 600;
let lastHiddenAt = 0;
let anyOpen = false;

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  shortcut,
  side = 'bottom',
  children,
  disabled = false,
  className = '',
}) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = useCallback(() => {
    if (disabled) return;
    clearTimer();
    const warm = anyOpen || Date.now() - lastHiddenAt < WARM_WINDOW_MS;
    timerRef.current = window.setTimeout(
      () => {
        anyOpen = true;
        setOpen(true);
      },
      warm ? 0 : OPEN_DELAY_MS
    );
  }, [disabled]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen((was) => {
      if (was) {
        anyOpen = false;
        lastHiddenAt = Date.now();
      }
      return false;
    });
    setCoords(null);
  }, []);

  useEffect(() => () => clearTimer(), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    const gap = 8;
    let x = 0;
    let y = 0;
    if (side === 'top') {
      x = a.left + a.width / 2 - t.width / 2;
      y = a.top - t.height - gap;
    } else if (side === 'bottom') {
      x = a.left + a.width / 2 - t.width / 2;
      y = a.bottom + gap;
    } else if (side === 'left') {
      x = a.left - t.width - gap;
      y = a.top + a.height / 2 - t.height / 2;
    } else {
      x = a.right + gap;
      y = a.top + a.height / 2 - t.height / 2;
    }
    const pad = 6;
    x = Math.max(pad, Math.min(window.innerWidth - t.width - pad, x));
    y = Math.max(pad, Math.min(window.innerHeight - t.height - pad, y));
    setCoords({ x, y });
  }, [open, side, label, shortcut]);

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-flex ${className}`}
        onPointerEnter={show}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="glass-menu fixed z-[100] pointer-events-none flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-white/90 whitespace-nowrap animate-fade-in"
            style={{
              left: coords?.x ?? -9999,
              top: coords?.y ?? -9999,
            }}
          >
            <span>{label}</span>
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </div>,
          document.body
        )}
    </>
  );
};
