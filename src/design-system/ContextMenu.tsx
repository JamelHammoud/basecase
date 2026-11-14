import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRightIcon } from './glyphs';
import { createPortal } from 'react-dom';
import { MenuDivider, MenuItem, MenuLabel } from './PopoverMenu';
import { MenuGutterPad, MenuGutterScope, MenuIconSlot, useMenuGutter } from './menuGutter';
import { arrangeMenu } from './menuOrder';

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
  | { heading: string; onSelect?: () => void };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  minWidth?: number;
  onClose: () => void;
}

const EDGE_PAD = 8;

const Submenu: React.FC<{ left: boolean; width: number; children: React.ReactNode }> = ({ left, width, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lift, setLift] = useState(0);

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();

    if (!rect) return;

    setLift(Math.max(0, Math.min(rect.bottom - (window.innerHeight - EDGE_PAD), rect.top - EDGE_PAD)));
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      className={`glass-menu absolute -top-1.5 rounded-[14px] [--pad-x:8px] p-[var(--pad-x)] animate-fade-in ${
        left ? 'right-full mr-2' : 'left-full ml-2'
      }`}
      style={{ width, transform: lift ? `translateY(${-lift}px)` : undefined }}
    >
      <MenuGutterScope>{children}</MenuGutterScope>
    </div>
  );
};

const SubmenuTrigger: React.FC<{ label: string; icon?: React.ReactNode; open: boolean; onToggle: () => void }> = ({
  label,
  icon,
  open,
  onToggle,
}) => {
  const padded = useMenuGutter(!!icon);

  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
      className={`w-full h-[32px] px-2.5 rounded-lg flex items-center gap-2 text-[13.5px] text-left cursor-default transition-colors ${
        open ? 'bg-white/[0.09] text-white' : 'text-white/90 hover:bg-white/[0.09]'
      }`}
    >
      {icon && <MenuIconSlot className="text-white/60">{icon}</MenuIconSlot>}
      {padded && <MenuGutterPad />}
      <span className="flex-1 truncate">{label}</span>
      <ChevronRightIcon className="w-3.5 h-3.5 text-white/50" />
    </button>
  );
};

const leadsWithColumn = (item: ContextMenuEntry) =>
  ('icon' in item && !!item.icon) || ('checked' in item && item.checked !== undefined);

const closingThen = (onClose: () => void, onSelect?: () => void) =>
  onSelect &&
  (() => {
    onClose();
    onSelect();
  });

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, minWidth = 240, onClose }) => {
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
      className="glass-menu fixed z-[96] w-max max-w-80 rounded-[14px] p-[var(--pad-x)] animate-pop-in"
      style={
        {
          left: pos?.left ?? x,
          top: pos?.top ?? y,
          minWidth,
          visibility: pos ? 'visible' : 'hidden',
          transformOrigin: pos?.origin,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties
      }
    >
      <MenuGutterScope shown={items.some(leadsWithColumn)}>
        {arrangeMenu(items).map((item, i) => {
          if ('divider' in item) return <MenuDivider key={i} />;

          if ('heading' in item)
            return (
              <MenuLabel key={i} onSelect={closingThen(onClose, item.onSelect)}>
                {item.heading}
              </MenuLabel>
            );

          if ('submenu' in item) {
            const open = openSub === i;

            return (
              <div key={i} className="relative" onPointerEnter={() => setOpenSub(i)}>
                <SubmenuTrigger
                  label={item.label}
                  icon={item.icon}
                  open={open}
                  onToggle={() => setOpenSub(open ? null : i)}
                />
                {open && (
                  <Submenu left={!!pos?.subLeft} width={item.submenuWidth ?? 260}>
                    {item.submenu(onClose)}
                  </Submenu>
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
      </MenuGutterScope>
    </div>,
    document.body,
  );
};
