import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { currentConfirm, subscribeConfirm } from './confirmStore';
import { Kbd } from './Kbd';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: React.ReactNode;
  shortcut?: string;
  side?: TooltipSide;
  children: React.ReactElement;
  disabled?: boolean;
  className?: string;
}

const OPEN_DELAY_MS = 500;
const WARM_WINDOW_MS = 600;
const TIP_GAP = 8;

type Rect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;

const TIP_POSITION: Record<TooltipSide, (a: Rect, t: Rect) => { x: number; y: number }> = {
  top: (a, t) => ({ x: a.left + a.width / 2 - t.width / 2, y: a.top - t.height - TIP_GAP }),
  bottom: (a, t) => ({ x: a.left + a.width / 2 - t.width / 2, y: a.bottom + TIP_GAP }),
  left: (a, t) => ({ x: a.left - t.width - TIP_GAP, y: a.top + a.height / 2 - t.height / 2 }),
  right: (a, t) => ({ x: a.right + TIP_GAP, y: a.top + a.height / 2 - t.height / 2 }),
};

let lastHiddenAt = 0;
let anyOpen = false;

const controlsOpenPopover = (child: React.ReactElement) => {
  const expanded = (child.props as { 'aria-expanded'?: boolean | 'true' | 'false' })['aria-expanded'];

  return expanded === true || expanded === 'true';
};

const behindModal = (anchor: Element) => {
  const modals = [...document.querySelectorAll('[aria-modal="true"]')];

  return modals.length > 0 && !modals.some((m) => m.contains(anchor));
};

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
  const confirming = useSyncExternalStore(subscribeConfirm, currentConfirm) !== null;
  const suppressed = disabled || confirming || controlsOpenPopover(children);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = useCallback(() => {
    if (suppressed) return;

    clearTimer();

    const warm = anyOpen || Date.now() - lastHiddenAt < WARM_WINDOW_MS;

    timerRef.current = window.setTimeout(
      () => {
        if (anchorRef.current && behindModal(anchorRef.current)) return;

        anyOpen = true;
        setOpen(true);
      },
      warm ? 0 : OPEN_DELAY_MS,
    );
  }, [suppressed]);

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

  const showOnKeyboardFocus = (e: React.FocusEvent) => {
    if ((e.target as Element).matches(':focus-visible')) show();
  };

  useEffect(() => () => clearTimer(), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;

    const a = anchorRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    const { x: rawX, y: rawY } = TIP_POSITION[side](a, t);
    const pad = 6;
    const x = Math.max(pad, Math.min(window.innerWidth - t.width - pad, rawX));
    const y = Math.max(pad, Math.min(window.innerHeight - t.height - pad, rawY));

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
        onFocus={showOnKeyboardFocus}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        !suppressed &&
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
          document.body,
        )}
    </>
  );
};
