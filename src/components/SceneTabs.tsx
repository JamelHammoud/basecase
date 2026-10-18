import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CopyPlus, History, Pencil, Plus, X } from 'lucide-react';
import { AgentSpinner, ContextMenu, ContextMenuEntry, IconButton, TextInput, Tooltip } from '../design-system';

export interface SceneTabInfo {
  id: string;
  name: string;
  partCount: number;
  /** The scene's agent is working */
  busy: boolean;
  /** What it's doing (“Designing Left Coxa Bracket”) */
  activity: string;
}

export interface SceneTabsProps {
  tabs: SceneTabInfo[];
  activeId: string;
  /** Last frame of each background scene */
  previews: Record<string, string>;
  canReopen: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseRight: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (from: number, to: number) => void;
  onReopen: () => void;
  /** A preview card opened: refresh that scene's frame */
  onPreview?: (id: string) => void;
}

/** Tabs are 28px pills at y = 8, on the title bar's centerline (y = 22) with its buttons; 8px above the cards */
export const TAB_HEIGHT = 28;
export const TAB_TOP = 8;
const GAP = 2;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const PREVIEW_DELAY_MS = 800;
const PREVIEW_WIDTH = 240;

/**
 * Open scenes as tabs in the title bar: compact pills, the active one on a soft lighter fill
 * with a hairline edge, the rest quiet labels.
 * Drag to reorder, double-click to rename, middle-click to close, right-click for more.
 * Resting on a background tab previews it, with its agent's live activity.
 */
export const SceneTabs: React.FC<SceneTabsProps> = ({
  tabs,
  activeId,
  previews,
  canReopen,
  onSelect,
  onNew,
  onClose,
  onCloseOthers,
  onCloseRight,
  onDuplicate,
  onRename,
  onReorder,
  onReopen,
  onPreview,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabEls = useRef(new Map<string, HTMLDivElement>());
  // Where each tab was last drawn, so moves (insert, close, drop) animate from there
  const lastLeft = useRef(new Map<string, number>());
  // The press being tracked; dx lives here too, since pointerup can arrive before the drag renders
  const press = useRef<{ id: string; index: number; x: number; dx: number; started: boolean } | null>(null);
  // Set on drop: tabs that don't need to slide drop their drag offset at once
  const settling = useRef(false);
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; left: number; top: number } | null>(null);
  const previewTimer = useRef<number | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  // Tabs there at launch don't animate in; later ones keep the class (it plays once, on mount)
  const [initialIds] = useState(() => new Set(tabs.map((t) => t.id)));

  /* Layout and drag math (offsets ignore transforms, so they stay put while dragging) */

  const layout = () =>
    tabs.map((t) => {
      const el = tabEls.current.get(t.id);
      return { left: el?.offsetLeft ?? 0, width: el?.offsetWidth ?? 0 };
    });

  const dropIndex = (from: number, dx: number) => {
    const l = layout();
    // Like a browser: a neighbour makes room once the dragged tab's leading edge crosses its middle
    const leftEdge = l[from].left + dx;
    const rightEdge = leftEdge + l[from].width;
    let to = from;
    l.forEach((r, i) => {
      const mid = r.left + r.width / 2;
      if (i < from && leftEdge <= mid) to = Math.min(to, i);
      if (i > from && rightEdge >= mid) to = Math.max(to, i);
    });
    return to;
  };

  /** Where a tab is drawn while dragging: the dragged one follows the pointer, the rest make room */
  const shiftOf = (index: number, d = drag) => {
    if (!d) return 0;
    const from = tabs.findIndex((t) => t.id === d.id);
    if (from === -1) return 0;
    if (index === from) return d.dx;
    const to = dropIndex(from, d.dx);
    const room = (tabEls.current.get(d.id)?.offsetWidth ?? 0) + GAP;
    if (from < to && index > from && index <= to) return -room;
    if (to < from && index >= to && index < from) return room;
    return 0;
  };

  // Tabs follow the drag, or slide from where they were drawn into their new slot
  useLayoutEffect(() => {
    const moved: HTMLDivElement[] = [];
    tabs.forEach((t, i) => {
      const el = tabEls.current.get(t.id);
      if (!el) return;
      if (drag) {
        el.style.transition = t.id === drag.id ? 'none' : `transform 180ms ${EASE}`;
        el.style.transform = `translateX(${shiftOf(i)}px)`;
        return;
      }
      const before = lastLeft.current.get(t.id);
      const delta = before === undefined ? 0 : before - el.offsetLeft;
      if (Math.abs(delta) > 0.5) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${delta}px)`;
        moved.push(el);
      } else if (settling.current) {
        el.style.transition = 'none';
        el.style.transform = '';
      }
      lastLeft.current.set(t.id, el.offsetLeft);
    });
    if (!drag) settling.current = false;
    if (moved.length) {
      void scrollerRef.current?.offsetWidth; // apply the start position before animating
      moved.forEach((el) => {
        el.style.transition = `transform 220ms ${EASE}`;
        el.style.transform = '';
      });
    }
    for (const id of [...lastLeft.current.keys()]) if (!tabs.some((t) => t.id === id)) lastLeft.current.delete(id);
  });

  // Keep the active tab in view
  useEffect(() => {
    tabEls.current.get(activeId)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId, tabs.length]);

  /**
   * Fade an edge only while tabs are hidden past it. Measured from layout offsets, not
   * scrollWidth, which also counts tabs mid-slide or mid-drag as overflow.
   */
  const measureFade = () => {
    const el = scrollerRef.current;
    const last = tabEls.current.get(tabs[tabs.length - 1]?.id ?? '');
    if (!el || !last) return;
    const contentRight = last.offsetLeft + last.offsetWidth;
    const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < contentRight - 1 };
    setFade((f) => (f.left === next.left && f.right === next.right ? f : next));
  };
  const measureFadeRef = useRef(measureFade);
  useLayoutEffect(() => {
    measureFadeRef.current = measureFade;
    measureFade();
  });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => measureFadeRef.current();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  useEffect(() => () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
  }, []);

  /* Preview card */

  const hidePreview = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreview(null);
  };

  const queuePreview = (id: string) => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (id === activeId || drag || renaming || press.current) {
      setPreview(null);
      return;
    }
    const open = () => {
      const r = tabEls.current.get(id)?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - PREVIEW_WIDTH - 8));
      setPreview({ id, left, top: r.bottom + 8 });
      onPreview?.(id);
    };
    // While one card is open, neighbours swap in at once
    if (preview) open();
    else previewTimer.current = window.setTimeout(open, PREVIEW_DELAY_MS);
  };

  /* Pointer: select on press, drag past 4px to reorder */

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, tab: SceneTabInfo, index: number) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose(tab.id);
      return;
    }
    if (e.button !== 0 || renaming === tab.id) return;
    if ((e.target as HTMLElement).closest('[data-tab-close]')) return;
    hidePreview();
    onSelect(tab.id);
    press.current = { id: tab.id, index, x: e.clientX, dx: 0, started: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    const raw = e.clientX - p.x;
    if (!p.started && Math.abs(raw) < 4) return;
    p.started = true;
    // Stay inside the strip
    const el = tabEls.current.get(p.id);
    const scroller = scrollerRef.current;
    const min = el ? -el.offsetLeft : raw;
    const max = el && scroller ? scroller.scrollWidth - el.offsetLeft - el.offsetWidth : raw;
    p.dx = Math.max(min, Math.min(max, raw));
    setDrag({ id: p.id, dx: p.dx });
  };

  const endPress = () => {
    const p = press.current;
    press.current = null;
    if (!p?.started) {
      setDrag(null);
      return;
    }
    const to = dropIndex(p.index, p.dx);
    // Remember where each tab is drawn now, so they settle from there into their new slots
    tabs.forEach((t, i) => {
      const el = tabEls.current.get(t.id);
      if (el) lastLeft.current.set(t.id, el.offsetLeft + shiftOf(i, p));
    });
    settling.current = true;
    setDrag(null);
    if (to !== p.index) onReorder(p.index, to);
  };

  const menuItems = (id: string): ContextMenuEntry[] => {
    const index = tabs.findIndex((t) => t.id === id);
    const ic = 'w-3.5 h-3.5';
    return [
      { label: 'Rename', icon: <Pencil className={ic} />, onSelect: () => setRenaming(id) },
      { label: 'Duplicate', icon: <CopyPlus className={ic} />, onSelect: () => onDuplicate(id) },
      { divider: true },
      { label: 'New Scene', shortcut: '⌘T', icon: <Plus className={ic} />, onSelect: onNew },
      { label: 'Reopen Closed Scene', shortcut: '⇧⌘T', icon: <History className={ic} />, disabled: !canReopen, onSelect: onReopen },
      { divider: true },
      { label: 'Close', shortcut: id === activeId ? '⌘W' : undefined, icon: <X className={ic} />, onSelect: () => onClose(id) },
      { label: 'Close Other Scenes', disabled: tabs.length < 2, onSelect: () => onCloseOthers(id) },
      { label: 'Close Scenes to the Right', disabled: index === tabs.length - 1, onSelect: () => onCloseRight(id) },
    ];
  };

  const previewTab = preview && tabs.find((t) => t.id === preview.id);
  const fadeMask =
    fade.left || fade.right
      ? `linear-gradient(to right, ${fade.left ? 'transparent, #000 24px' : '#000'}, ${fade.right ? '#000 calc(100% - 24px), transparent' : '#000'})`
      : undefined;

  return (
    <>
      <div className="flex items-stretch min-w-0 select-none" style={{ height: TAB_HEIGHT }}>
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label="Open scenes"
          className="relative min-w-0 flex items-stretch overflow-x-auto overflow-y-hidden no-scrollbar"
          style={{ gap: GAP, maskImage: fadeMask, WebkitMaskImage: fadeMask }}
          onWheel={(e) => {
            const el = scrollerRef.current;
            if (el && el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
          }}
        >
          {tabs.map((tab, index) => {
            const active = tab.id === activeId;
            const dragging = drag?.id === tab.id;
            return (
              <div
                key={tab.id}
                ref={(el) => {
                  if (el) tabEls.current.set(tab.id, el);
                  else tabEls.current.delete(tab.id);
                }}
                role="tab"
                aria-selected={active}
                className={`group relative flex items-center rounded-[8px] cursor-default transition-colors duration-150 ${
                  active
                    ? 'bg-[#262626]'
                    : dragging
                      ? 'bg-white/[0.07]'
                      : 'hover:bg-white/[0.05]'
                } ${active || dragging ? 'z-10' : ''} ${initialIds.has(tab.id) ? '' : 'animate-tab-in'}`}
                // A definite width (not just flex-basis) so the strip sizes to full tabs, then shrinks them to fit
                style={{ width: 180, flexShrink: 1, minWidth: 96, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onPointerDown={(e) => onPointerDown(e, tab, index)}
                onPointerMove={onPointerMove}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onPointerEnter={() => queuePreview(tab.id)}
                onPointerLeave={hidePreview}
                onAuxClick={(e) => e.button === 1 && e.preventDefault()}
                onDoubleClick={(e) => {
                  if (!(e.target as HTMLElement).closest('[data-tab-close]')) setRenaming(tab.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  hidePreview();
                  setMenu({ id: tab.id, x: e.clientX, y: e.clientY });
                }}
              >
                <div className="relative flex-1 min-w-0 flex items-center gap-2 pl-[10px] pr-[4px]">
                  {tab.busy && <AgentSpinner />}
                  {renaming === tab.id ? (
                    <div className="flex-1 min-w-0" onPointerDown={(e) => e.stopPropagation()}>
                      <TextInput
                        bare
                        autoFocus
                        defaultValue={tab.name}
                        aria-label="Scene name"
                        className="h-[24px]! pl-1.5! text-[13px]"
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') {
                            e.currentTarget.value = tab.name;
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={(e) => {
                          const name = e.currentTarget.value.trim();
                          if (name && name !== tab.name) onRename(tab.id, name);
                          setRenaming(null);
                        }}
                      />
                    </div>
                  ) : (
                    <span
                      className={`flex-1 min-w-0 truncate text-[13px] transition-colors duration-150 ${
                        active ? 'text-white/90 font-medium' : 'text-white/50 font-medium group-hover:text-white/80'
                      }`}
                    >
                      {tab.name || 'Untitled'}
                    </span>
                  )}
                  <Tooltip label="Close" shortcut={active ? '⌘W' : undefined} className="shrink-0 flex">
                    <button
                      type="button"
                      data-tab-close
                      aria-label={`Close ${tab.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        hidePreview();
                        onClose(tab.id);
                      }}
                      className="w-[20px] h-[20px] grid place-items-center rounded-[6px] text-white/45 hover:text-white/90 hover:bg-white/[0.1] active:scale-[0.94] opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 focus-visible:opacity-100 transition-[opacity,background-color,color,transform] duration-150"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
        <div className="shrink-0 flex items-center pl-[4px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <IconButton icon={<Plus className="w-4 h-4" />} title="New scene" shortcut="⌘T" className="w-[28px]! h-[28px]!" onClick={onNew} />
        </div>
      </div>

      {previewTab &&
        preview &&
        createPortal(
          <div
            role="tooltip"
            className="glass-menu fixed z-[60] rounded-[14px] overflow-hidden pointer-events-none animate-pop-in"
            style={{ left: preview.left, top: preview.top, width: PREVIEW_WIDTH }}
          >
            {previews[previewTab.id] && (
              <img
                src={previews[previewTab.id]}
                alt=""
                className="block w-full aspect-[16/10] object-cover bg-[#1b1b1b]"
              />
            )}
            <div className="px-3 py-2.5">
              <div className="text-[13px] font-medium text-white/90 truncate">{previewTab.name || 'Untitled'}</div>
              <div className="text-[12px] text-white/45 tabular mt-0.5 flex items-center gap-1.5 min-w-0">
                {previewTab.busy && <AgentSpinner />}
                <span className="truncate">
                  {previewTab.busy
                    ? previewTab.activity || 'Working'
                    : previewTab.partCount === 0
                      ? 'No parts'
                      : `${previewTab.partCount} part${previewTab.partCount === 1 ? '' : 's'}`}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
    </>
  );
};
