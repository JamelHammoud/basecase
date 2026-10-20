import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRightIcon } from './glyphs';
import { createPortal } from 'react-dom';
import { MenuDivider, MenuItem, MenuLabel } from './PopoverMenu';

export type ContextMenuEntry =
  | {
      label: string;
      onSelect: () => void;
      icon?: React.ReactNode;
      shortcut?: string;
      checked?: boolean;
      disabled?: boolean;
      tone?: 'default' | 'danger';
    }
  | {
      label: string;
      icon?: React.ReactNode;
      submenu: (close: () => void) => React.ReactNode;
      submenuWidth?: number;
    }
  | { divider: true }
  | { heading: string };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string; subLeft: boolean } | null>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const flipX = x + width > window.innerWidth - pad;
    const flipY = y + height > window.innerHeight - pad;

    setPos({
      left: Math.max(pad, flipX ? x - width : x),
      top: Math.max(pad, flipY ? y - height : y),
      origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`,
      subLeft: (flipX ? x - width : x) + width + 280 > window.innerWidth,
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onClose, { passive: true });
    window.addEventListener('blur', onClose);

    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="glass-menu fixed z-[96] w-max min-w-60 max-w-80 rounded-[14px] p-[var(--pad-x)] animate-pop-in"
      style={
        {
          left: pos?.left ?? x,
          top: pos?.top ?? y,
          visibility: pos ? 'visible' : 'hidden',
          transformOrigin: pos?.origin,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties
      }
    >
      {items.map((item, i) => {
        if ('divider' in item) return <MenuDivider key={i} />;

        if ('heading' in item) return <MenuLabel key={i}>{item.heading}</MenuLabel>;

        if ('submenu' in item) {
          const open = openSub === i;

          return (
            <div key={i} className="relative" onPointerEnter={() => setOpenSub(i)}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpenSub(open ? null : i)}
                className={`w-full h-8 px-2.5 rounded-lg flex items-center gap-2 text-[13.5px] text-left cursor-default transition-colors ${
                  open ? 'bg-white/[0.09] text-white' : 'text-white/90 hover:bg-white/[0.09]'
                }`}
              >
                <span className="w-4 shrink-0 flex justify-center text-white/60">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                <ChevronRightIcon className="w-3.5 h-3.5 text-white/40" />
              </button>
              {open && (
                <div
                  role="menu"
                  className={`glass-menu absolute -top-1.5 rounded-[14px] [--pad-x:8px] p-[var(--pad-x)] animate-fade-in ${
                    pos?.subLeft ? 'right-full mr-2' : 'left-full ml-2'
                  }`}
                  style={{ width: item.submenuWidth ?? 260 }}
                >
                  {item.submenu(onClose)}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={i} onPointerEnter={() => setOpenSub(null)}>
            <MenuItem
              icon={item.icon}
              label={item.label}
              shortcut={item.shortcut}
              checked={item.checked}
              disabled={item.disabled}
              tone={item.tone}
              onSelect={() => {
                onClose();
                item.onSelect();
              }}
            />
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
