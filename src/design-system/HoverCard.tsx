import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface HoverCardProps {
  content: () => React.ReactNode;
  side?: 'right' | 'left';
  children: React.ReactElement;
  className?: string;
  width?: number;
  beside?: string;
  placement?: 'beside' | 'below';
  inline?: boolean;
}

const OPEN_DELAY_MS = 450;
const WARM_OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 300;
const WARM_WINDOW_MS = 500;
const GAP = 10;
const BELOW_GAP = 6;
const PAD = 8;
let lastClosedAt = 0;
let anyOpen = false;

function besideAnchor({ a, c, box, side }: { a: DOMRect; c: DOMRect; box: DOMRect; side: 'right' | 'left' }) {
  let x = side === 'right' ? box.right + GAP : box.left - c.width - GAP;

  if (x + c.width > window.innerWidth - PAD) x = a.left - c.width - GAP;

  if (x < PAD) x = a.right + GAP;

  return { x, y: Math.max(PAD, Math.min(window.innerHeight - c.height - PAD, a.top)) };
}

function belowAnchor(a: DOMRect, c: DOMRect) {
  const fitsBelow = a.bottom + BELOW_GAP + c.height <= window.innerHeight - PAD;
  const y = fitsBelow ? a.bottom + BELOW_GAP : Math.max(PAD, a.top - BELOW_GAP - c.height);

  return { x: Math.max(PAD, Math.min(window.innerWidth - c.width - PAD, a.left)), y };
}

export const HoverCard: React.FC<HoverCardProps> = ({
  content,
  side = 'right',
  children,
  className = '',
  width = 320,
  beside,
  placement = 'beside',
  inline = false,
}) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);

    if (closeTimer.current) window.clearTimeout(closeTimer.current);

    openTimer.current = closeTimer.current = null;
  };

  const show = useCallback(() => {
    clear();

    if (open) return;

    const warm = anyOpen || Date.now() - lastClosedAt < WARM_WINDOW_MS;

    openTimer.current = window.setTimeout(
      () => {
        anyOpen = true;
        setOpen(true);
      },
      warm ? WARM_OPEN_DELAY_MS : OPEN_DELAY_MS,
    );
  }, [open]);

  const close = useCallback(() => {
    clear();
    setOpen((was) => {
      if (was) {
        anyOpen = false;
        lastClosedAt = Date.now();
      }

      return false;
    });
    setCoords(null);
  }, []);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }

    if (closeTimer.current) window.clearTimeout(closeTimer.current);

    closeTimer.current = window.setTimeout(close, CLOSE_DELAY_MS);
  }, [close]);

  useEffect(() => () => clear(), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !cardRef.current) return;

    const a = anchorRef.current.getBoundingClientRect();
    const c = cardRef.current.getBoundingClientRect();
    const box = (beside && anchorRef.current.closest(beside)?.getBoundingClientRect()) || a;

    setCoords(placement === 'below' ? belowAnchor(a, c) : besideAnchor({ a, c, box, side }));
  }, [open, side, beside, placement]);

  return (
    <>
      <span
        ref={anchorRef}
        className={`${inline ? 'inline' : 'inline-flex'} ${className}`}
        onPointerEnter={show}
        onPointerLeave={scheduleClose}
        onPointerDown={close}
        onDragStart={close}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            onPointerEnter={() => closeTimer.current && window.clearTimeout(closeTimer.current)}
            onPointerLeave={scheduleClose}
            className="glass-menu fixed z-[90] rounded-[14px] overflow-y-auto overflow-x-hidden no-scrollbar max-h-[calc(100vh-16px)] text-[13px] text-white/90 animate-card-in [--pad-x:0px]"
            style={{ left: coords?.x ?? -9999, top: coords?.y ?? -9999, width }}
          >
            {content()}
          </div>,
          document.body,
        )}
    </>
  );
};
