import React from 'react';
import { AGENT_WORKING, RenameField, Spinner, Tooltip, CloseIcon } from '../../design-system';
import type { SceneTabInfo } from '../SceneTabs';
import { keyFor } from '../../app/shortcuts';

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

const CLOSE_ON_HOVER =
  'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150';
const NAME_UNDER_CLOSE = 'group-hover:[mask-image:linear-gradient(to_left,transparent_18px,black_34px)]';

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
}> = ({ tab, active, dragging, isNew, renaming, track, handlers: h }) => {
  const name = tab.name || 'Untitled';

  return (
    <div
      ref={track}
      role="tab"
      aria-selected={active}
      aria-label={name}
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
      <div
        className={`relative flex-1 min-w-0 self-stretch flex items-center gap-2 pl-[10px] ${active ? 'pr-[28px]' : 'pr-[10px]'}`}
      >
        {tab.busy && <Spinner label={AGENT_WORKING} />}
        {renaming ? (
          <RenameField name={tab.name} label="Scene name" onDone={h.onFinishRename} />
        ) : (
          <span
            className={`flex-1 min-w-0 truncate text-[13px] transition-colors duration-150 ${
              active
                ? 'text-white/90 font-medium'
                : `text-white/50 font-medium group-hover:text-white/90 ${NAME_UNDER_CLOSE}`
            }`}
          >
            {name}
          </span>
        )}
        <Tooltip
          label="Close"
          shortcut={active ? keyFor('close-tab') : undefined}
          className={`absolute inset-y-0 right-0 items-center ${active ? '' : CLOSE_ON_HOVER}`}
        >
          <button
            type="button"
            data-tab-close
            tabIndex={-1}
            aria-label={`Close ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              h.onCloseTab();
            }}
            className="group/close w-[28px] h-[28px] grid place-items-center text-white/50 hover:text-white/90 active:scale-[0.94] cursor-default transition-[color,transform] duration-150"
          >
            <span className="w-[20px] h-[20px] grid place-items-center rounded-[6px] group-hover/close:bg-white/[0.1] transition-colors duration-150">
              <CloseIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
