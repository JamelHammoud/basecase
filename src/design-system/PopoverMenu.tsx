import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { Kbd } from './Kbd';
import { Divider } from './Divider';

export interface PopoverMenuProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Horizontal alignment relative to the trigger */
  align?: 'start' | 'center' | 'end';
  /** Elements (e.g. the trigger) whose clicks shouldn't dismiss the menu */
  ignoreRef?: React.RefObject<HTMLElement | null>;
}

/** Space between the trigger and the menu, and between the menu and the window edge */
const GAP = { top: 10, bottom: 8, left: 8, right: 8 };
const EDGE = 8;

type Side = NonNullable<PopoverMenuProps['position']>;

/** Where the menu goes for a trigger rect: preferred side, flipped if it doesn't fit, clamped to the window */
function placeMenu(a: DOMRect, w: number, h: number, side: Side, align: NonNullable<PopoverMenuProps['align']>) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let s = side;
  if (s === 'top' && a.top - GAP.top - h < EDGE && a.bottom + GAP.bottom + h <= vh - EDGE) s = 'bottom';
  else if (s === 'bottom' && a.bottom + GAP.bottom + h > vh - EDGE && a.top - GAP.top - h >= EDGE) s = 'top';
  else if (s === 'left' && a.left - GAP.left - w < EDGE && a.right + GAP.right + w <= vw - EDGE) s = 'right';
  else if (s === 'right' && a.right + GAP.right + w > vw - EDGE && a.left - GAP.left - w >= EDGE) s = 'left';

  let left: number;
  let top: number;
  if (s === 'top' || s === 'bottom') {
    top = s === 'top' ? a.top - GAP.top - h : a.bottom + GAP.bottom;
    left = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
  } else {
    left = s === 'left' ? a.left - GAP.left - w : a.right + GAP.right;
    top = align === 'start' ? a.top : align === 'end' ? a.bottom - h : a.top + a.height / 2 - h / 2;
  }
  left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
  top = Math.max(EDGE, Math.min(top, vh - h - EDGE));
  return { left, top, side: s };
}

/**
 * Menu anchored to its parent (the trigger's `relative` wrapper). It renders in a portal so
 * docked panels with overflow-hidden never clip it, and stays inside the window.
 */
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
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, ignoreRef]);

  // Measure before paint, then follow the trigger through resizes, scrolls and content changes
  useLayoutEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const anchor = anchorRef.current?.parentElement;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const next = placeMenu(anchor.getBoundingClientRect(), menu.offsetWidth, menu.offsetHeight, position, align);
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
          <div
            className={`glass-menu rounded-[14px] p-[var(--pad-x)] min-w-44 ${
              side === 'top' ? 'animate-pop-up' : side === 'bottom' ? 'animate-pop-in' : 'animate-fade-in'
            } ${className}`}
          >
            {children}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export interface MenuItemProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  shortcut?: string;
  checked?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

export const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  shortcut,
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
      tone === 'danger'
        ? 'text-red-400 hover:bg-red-500/15'
        : 'text-white/90 hover:bg-[#0d99ff] hover:text-white'
    } group/menuitem`}
  >
    {checked !== undefined && (
      <span className="w-4 shrink-0 flex justify-center">
        {checked && <Check className="w-3.5 h-3.5" />}
      </span>
    )}
    {icon && <span className="w-4 shrink-0 flex justify-center text-white/60 group-hover/menuitem:text-white">{icon}</span>}
    <span className="flex-1 truncate">{label}</span>
    {shortcut && <Kbd className="group-hover/menuitem:[&_kbd]:bg-white/20 group-hover/menuitem:[&_kbd]:text-white">{shortcut}</Kbd>}
  </button>
);

export const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-white/40 select-none">
    {children}
  </div>
);

/** Full-width separator between menu groups */
export const MenuDivider: React.FC = () => <Divider className="my-1" />;
