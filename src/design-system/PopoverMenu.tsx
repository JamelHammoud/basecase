import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TickIcon } from './glyphs';
import { createPortal } from 'react-dom';
import { Kbd } from './Kbd';
import { Divider } from './Divider';

export interface PopoverMenuProps {
  isOpen: boolean;
  onClose: (reason: 'outside' | 'escape') => void;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  ignoreRef?: React.RefObject<HTMLElement | null>;
}

const GAP = { top: 10, bottom: 8, left: 8, right: 8 };
const EDGE = 8;

type Side = NonNullable<PopoverMenuProps['position']>;

type Align = NonNullable<PopoverMenuProps['align']>;

interface MenuBox {
  anchor: DOMRect;
  w: number;
  h: number;
  vw: number;
  vh: number;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const FITS: Record<Side, (box: MenuBox) => boolean> = {
  top: ({ anchor, h }) => anchor.top - GAP.top - h >= EDGE,
  bottom: ({ anchor, h, vh }) => anchor.bottom + GAP.bottom + h <= vh - EDGE,
  left: ({ anchor, w }) => anchor.left - GAP.left - w >= EDGE,
  right: ({ anchor, w, vw }) => anchor.right + GAP.right + w <= vw - EDGE,
};

const OUTSIDE: Record<Side, (box: MenuBox) => number> = {
  top: ({ anchor, h }) => anchor.top - GAP.top - h,
  bottom: ({ anchor }) => anchor.bottom + GAP.bottom,
  left: ({ anchor, w }) => anchor.left - GAP.left - w,
  right: ({ anchor }) => anchor.right + GAP.right,
};

function alignAlong(align: Align, span: { start: number; end: number; length: number; size: number }): number {
  if (align === 'start') return span.start;

  if (align === 'end') return span.end - span.size;

  return span.start + span.length / 2 - span.size / 2;
}

function placeMenu(box: MenuBox, side: Side, align: Align) {
  const { anchor: a, w, h, vw, vh } = box;
  const s = !FITS[side](box) && FITS[OPPOSITE[side]](box) ? OPPOSITE[side] : side;
  const vertical = s === 'top' || s === 'bottom';
  const left = vertical
    ? alignAlong(align, { start: a.left, end: a.right, length: a.width, size: w })
    : OUTSIDE[s](box);
  const top = vertical
    ? OUTSIDE[s](box)
    : alignAlong(align, { start: a.top, end: a.bottom, length: a.height, size: h });

  return {
    left: Math.max(EDGE, Math.min(left, vw - w - EDGE)),
    top: Math.max(EDGE, Math.min(top, vh - h - EDGE)),
    side: s,
  };
}

const ANIMATION: Record<Side, string> = {
  top: 'animate-pop-up',
  bottom: 'animate-pop-in',
  left: 'animate-fade-in',
  right: 'animate-fade-in',
};

export const PopoverMenu: React.FC<PopoverMenuProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  position = 'top',
  align = 'center',
  ignoreRef,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; side: Side } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Node;

      if (menuRef.current?.contains(target)) return;

      if (ignoreRef?.current?.contains(target)) return;

      onClose('outside');
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose('escape');
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, ignoreRef]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const place = () => {
      const anchor = anchorRef.current?.parentElement;
      const menu = menuRef.current;

      if (!anchor || !menu) return;

      const next = placeMenu(
        {
          anchor: anchor.getBoundingClientRect(),
          w: menu.offsetWidth,
          h: menu.offsetHeight,
          vw: window.innerWidth,
          vh: window.innerHeight,
        },
        position,
        align,
      );

      setPlacement((p) => (p && p.left === next.left && p.top === next.top && p.side === next.side ? p : next));
    };

    place();

    const observer = new ResizeObserver(place);

    if (menuRef.current) observer.observe(menuRef.current);

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      setPlacement(null);
    };
  }, [isOpen, position, align]);

  if (!isOpen) return null;

  const side = placement?.side ?? position;

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[85]"
          style={
            {
              WebkitAppRegion: 'no-drag',
              left: placement?.left ?? 0,
              top: placement?.top ?? 0,
              visibility: placement ? 'visible' : 'hidden',
            } as React.CSSProperties
          }
        >
          <div className={`glass-menu rounded-[14px] p-[var(--pad-x)] min-w-44 ${ANIMATION[side]} ${className}`}>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export interface MenuItemProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  shortcut?: string;
  detail?: string;
  checked?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

export const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  shortcut,
  detail,
  checked,
  onSelect,
  disabled = false,
  tone = 'default',
}) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onSelect}
    className={`w-full h-8 px-2.5 rounded-lg flex items-center gap-2 text-[13.5px] text-left cursor-default transition-colors disabled:opacity-35 ${
      tone === 'danger' ? 'text-red-400 hover:bg-red-500/15' : 'text-white/90 hover:bg-[#0d99ff] hover:text-white'
    } group/menuitem`}
  >
    {checked !== undefined && (
      <span className="w-4 shrink-0 flex justify-center">{checked && <TickIcon className="w-3.5 h-3.5" />}</span>
    )}
    {icon && (
      <span className="w-4 shrink-0 flex justify-center text-white/60 group-hover/menuitem:text-white">{icon}</span>
    )}
    <span className="flex-1 truncate">{label}</span>
    {detail && (
      <span className="shrink-0 text-[12.5px] text-white/40 group-hover/menuitem:text-white/80">{detail}</span>
    )}
    {shortcut && (
      <Kbd className="group-hover/menuitem:[&_kbd]:bg-white/20 group-hover/menuitem:[&_kbd]:text-white">{shortcut}</Kbd>
    )}
  </button>
);

export const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-white/40 select-none">{children}</div>
);

export const MenuDivider: React.FC = () => <Divider className="my-1" />;
