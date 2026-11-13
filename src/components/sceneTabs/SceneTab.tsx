import React from 'react';
import { AgentSpinner, RenameField, Tooltip, CloseIcon } from '../../design-system';
import type { SceneTabInfo } from '../SceneTabs';

export interface SceneTabHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onStartRename: () => void;
  onFinishRename: (name: string | null) => void;
  onMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCloseTab: () => void;
}

const isCloseButton = (target: EventTarget) => !!(target as HTMLElement).closest('[data-tab-close]');

function tabFill(active: boolean, dragging: boolean) {
  if (active) return 'bg-[#262626]';

  const edge = 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]';

  return dragging ? `bg-white/[0.07] ${edge}` : `hover:bg-white/[0.05] ${edge}`;
}

export const SceneTab: React.FC<{
  tab: SceneTabInfo;
  active: boolean;
  dragging: boolean;
  isNew: boolean;
  renaming: boolean;
  track: (el: HTMLDivElement | null) => void;
  handlers: SceneTabHandlers;
}> = ({ tab, active, dragging, isNew, renaming, track, handlers: h }) => (
  <div
    ref={track}
    role="tab"
    aria-selected={active}
    className={`group relative flex items-center rounded-[8px] cursor-default transition-colors duration-150 ${tabFill(
      active,
      dragging,
    )} ${active || dragging ? 'z-10' : ''} ${isNew ? 'animate-tab-in' : ''}`}
    style={{ width: 180, flexShrink: 1, minWidth: 96, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    onPointerDown={h.onPointerDown}
    onPointerMove={h.onPointerMove}
    onPointerUp={h.onPointerUp}
    onPointerCancel={h.onPointerUp}
    onPointerEnter={h.onPointerEnter}
    onPointerLeave={h.onPointerLeave}
    onAuxClick={(e) => e.button === 1 && e.preventDefault()}
    onDoubleClick={(e) => {
      if (!isCloseButton(e.target)) h.onStartRename();
    }}
    onContextMenu={h.onMenu}
  >
    <div className="relative flex-1 min-w-0 self-stretch flex items-center gap-2 pl-[10px]">
      {tab.busy && <AgentSpinner />}
      {renaming ? (
        <RenameField name={tab.name} label="Scene name" onDone={h.onFinishRename} />
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
        <span
          data-tab-close
          aria-hidden
          onClick={(e) => {
            e.stopPropagation();
            h.onCloseTab();
          }}
          className="group/close w-[28px] h-[28px] grid place-items-center text-white/50 hover:text-white/90 active:scale-[0.94] opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 transition-[opacity,color,transform] duration-150"
        >
          <span className="w-[20px] h-[20px] grid place-items-center rounded-[6px] group-hover/close:bg-white/[0.1] transition-colors duration-150">
            <CloseIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
          </span>
        </span>
      </Tooltip>
    </div>
  </div>
);
