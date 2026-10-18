import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AGENT_COLOR } from './theme';
import { PopoverMenu } from './PopoverMenu';
import { Tooltip } from './Tooltip';
import { useScrollFade } from './useScrollFade';

/** Edge fade on the tab row, and the room kept between it and the current tab when scrolling it into view */
const FADE_PX = 24;

export interface PanelTab<T extends string> {
  value: T;
  label: string;
  /** Shown before the label, e.g. the agent spinner while it works */
  indicator?: React.ReactNode;
  /** A menu for the current tab: hovering its pill reveals a chevron that opens it */
  menu?: {
    /** The chevron's tooltip */
    title: string;
    content: (close: () => void) => React.ReactNode;
    className?: string;
  };
}

export interface PanelTabsProps<T extends string> {
  tabs: PanelTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the tab list for screen readers */
  label: string;
}

/**
 * A card's view switcher (Layers · Parts · Library, Inspect · Agent), in the same voice as the
 * scene tabs: quiet labels, the current one on a soft pill. Content-sized and left-aligned.
 * When the tabs don't fit they scroll sideways (the wheel scrolls too), an edge fading only while
 * tabs are hidden past it, and the current tab scrolls into view.
 */
export function PanelTabs<T extends string>({ tabs, value, onChange, label }: PanelTabsProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fade = useScrollFade(FADE_PX, 'x');
  const menu = tabs.find((t) => t.value === value)?.menu;
  const open = menuOpen && !!menu;
  const close = () => setMenuOpen(false);

  // Keep the current tab clear of the fades: when it changes (smoothly), and when the row resizes (at once)
  const tabCount = tabs.length;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const reveal = (behavior: ScrollBehavior) => {
      const tab = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab || el.scrollWidth <= el.clientWidth) return;
      const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const right = left + tab.offsetWidth;
      const room = Math.min(FADE_PX, (el.clientWidth - tab.offsetWidth) / 2);
      if (left - room < el.scrollLeft) el.scrollTo({ left: left - room, behavior });
      else if (right + room > el.scrollLeft + el.clientWidth) el.scrollTo({ left: right + room - el.clientWidth, behavior });
    };
    reveal('smooth');
    // The observer reports once on observe; skip that, or it would cut the smooth scroll short
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) first = false;
      else reveal('auto');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, tabCount]);

  return (
    // The menu anchors to the whole row, so it opens under the card's first tab, not the pill
    <div className="relative min-w-0 flex select-none">
      <div
        ref={(node) => {
          scrollerRef.current = node;
          fade.ref(node);
        }}
        role="tablist"
        aria-label={label}
        // 2px of room on every side (cancelled by the margin) so focus rings aren't clipped
        className="min-w-0 flex items-center gap-0.5 overflow-x-auto overflow-y-hidden no-scrollbar p-[2px] -m-[2px]"
        style={fade.style}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.value === value;
          if (selected && tab.menu) {
            return (
              <TabWithMenu
                key={tab.value}
                ref={pillRef}
                tab={tab}
                menu={tab.menu}
                open={open}
                onToggle={() => setMenuOpen((v) => !v)}
              />
            );
          }
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                close();
                onChange(tab.value);
              }}
              className={`h-[28px] shrink-0 whitespace-nowrap rounded-[8px] flex items-center gap-1.5 text-[13px] font-medium cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                // A tab with a menu keeps its pill's 11px right padding when it isn't the current tab
                tab.menu ? 'pl-[10px] pr-[11px]' : 'px-[10px]'
              } ${
                selected
                  ? 'bg-white/[0.08] text-white/90'
                  : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
              }`}
            >
              {tab.indicator}
              {tab.label}
            </button>
          );
        })}
      </div>
      {menu && (
        <PopoverMenu
          isOpen={open}
          onClose={close}
          ignoreRef={pillRef}
          position="bottom"
          align="start"
          className={menu.className}
        >
          {menu.content(close)}
        </PopoverMenu>
      )}
    </div>
  );
}

/**
 * The current tab when it has a menu: the same pill, which widens on hover as a chevron fades in
 * beside the label. Clicking anywhere on it opens the menu.
 */
function TabWithMenu<T extends string>({
  ref,
  tab,
  menu,
  open,
  onToggle,
}: {
  ref: React.Ref<HTMLDivElement>;
  tab: PanelTab<T>;
  menu: NonNullable<PanelTab<T>['menu']>;
  open: boolean;
  onToggle: () => void;
}) {
  // Expanded while hovered or open. At rest 1px more on the right than the plain tabs, so the label looks
  // centred; with the chevron, 7px, since its glyph has 3px of air: its ink sits 10px from the edge, like the label's
  return (
    <div ref={ref} className={`group/tab relative shrink-0 whitespace-nowrap ${open ? 'is-shown' : ''}`}>
      <Tooltip label={menu.title} side="bottom" disabled={open}>
        <button
          type="button"
          role="tab"
          aria-selected
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
          className={`h-[28px] pl-[10px] pr-[11px] group-hover/tab:pr-[7px] group-[.is-shown]/tab:pr-[7px] rounded-[8px] flex items-center text-[13px] font-medium text-white/90 cursor-default transition-[padding,background-color,transform] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] ${
            open ? 'bg-white/[0.11]' : 'bg-white/[0.08] hover:bg-white/[0.1]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {tab.indicator}
            {tab.label}
          </span>
          {/* The chevron's column grows from nothing, so the pill widens as it fades in from the left */}
          <span
            className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] group-hover/tab:grid-cols-[1fr] group-[.is-shown]/tab:grid-cols-[1fr]"
            aria-hidden
          >
            <span className="min-w-0 overflow-hidden flex">
              <ChevronDown
                className={`ml-[4px] w-3.5 h-3.5 shrink-0 opacity-0 -translate-x-[6px] transition-[opacity,translate,rotate] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] group-hover/tab:opacity-100 group-hover/tab:translate-x-0 group-[.is-shown]/tab:opacity-100 group-[.is-shown]/tab:translate-x-0 ${
                  open ? 'rotate-180 text-white/90' : 'text-white/55'
                }`}
                strokeWidth={2.25}
              />
            </span>
          </span>
        </button>
      </Tooltip>
    </div>
  );
}

/** Claude's coral ring, spinning while an agent works (scene tabs, the Agent tab) */
export const AgentSpinner: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg
    viewBox="0 0 16 16"
    className={`${className} shrink-0 motion-safe:animate-spin [animation-duration:900ms]`}
    aria-label="Agent working"
  >
    <circle cx="8" cy="8" r="6" fill="none" stroke={AGENT_COLOR} strokeOpacity="0.3" strokeWidth="2.25" />
    <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke={AGENT_COLOR} strokeWidth="2.25" strokeLinecap="round" />
  </svg>
);
