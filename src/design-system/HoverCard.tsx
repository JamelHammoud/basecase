import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface HoverCardProps {
  /** Card content (pads itself); rendered only while open */
  content: () => React.ReactNode;
  side?: 'right' | 'left';
  children: React.ReactElement;
  /** Classes for the anchor wrapper */
  className?: string;
  /** Card width in px */
  width?: number;
  /** Open beside this ancestor (CSS selector, e.g. "aside") instead of the anchor, so it never covers neighbours */
  beside?: string;
}

// Slower than a tooltip so passing over the grid doesn't flash cards. While warm, neighbours
// still wait a beat, so crossing a tile on the way to the open card's links doesn't swap it.
const OPEN_DELAY_MS = 450;
const WARM_OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 300;
const WARM_WINDOW_MS = 500;
let lastClosedAt = 0;
let anyOpen = false;

/**
 * Rich hover details beside an anchor (e.g. a Parts tile). The pointer can move onto the
 * card to use its links; it closes shortly after the pointer leaves both.
 */
export const HoverCard: React.FC<HoverCardProps> = ({ content, side = 'right', children, className = '', width = 320, beside }) => {
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
    openTimer.current = window.setTimeout(() => {
      anyOpen = true;
      setOpen(true);
    }, warm ? WARM_OPEN_DELAY_MS : OPEN_DELAY_MS);
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
    const gap = 10;
    let x = side === 'right' ? box.right + gap : box.left - c.width - gap;
    if (x + c.width > window.innerWidth - 8) x = a.left - c.width - gap;
    if (x < 8) x = a.right + gap;
    const pad = 8;
    const y = Math.max(pad, Math.min(window.innerHeight - c.height - pad, a.top));
    setCoords({ x, y });
  }, [open, side, beside]);

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-flex ${className}`}
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
          document.body
        )}
    </>
  );
};
