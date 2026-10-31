import type React from 'react';
import { SceneTabs, TAB_HEIGHT, TAB_TOP } from '../components/SceneTabs';
import { ScenesMenu, type ScenesMenuProps } from '../components/ScenesMenu';
import { BasecaseLogo, IconButton, LAYOUT, MenuIcon, NO_DRAG_REGION, PanelLeftIcon } from '../design-system';
import { IS_WINDOWS } from '../utils/os';
import { useCaptionInset } from '../utils/useCaptionInset';
import { useStoplights } from '../utils/useStoplights';
import { idsAfter, idsExcept, sceneTabsOf, type Metas, type TabEntry } from './tabModel';

const TOGGLE_LEFT = LAYOUT.lightsX + LAYOUT.lightsWidth + 8;
const TOGGLE_LEFT_BARE = 26 - 14;
const LEADING_STEP = 28 + 4;
const hasAppMenuButton = IS_WINDOWS && Boolean(window.electronAPI?.popupAppMenu);
const hasWebLogo = !window.electronAPI?.isElectron;
const hasLeadingSlot = hasAppMenuButton || hasWebLogo;

function openAppMenu(e: React.MouseEvent<HTMLElement>) {
  const box = e.currentTarget.getBoundingClientRect();

  void window.electronAPI?.popupAppMenu?.({ x: box.left, y: box.bottom + 4 });
}

export interface TitleBarTabActions {
  selectTab: (id: string) => void;
  newScene: () => void;
  closeTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  duplicateTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  reorderTab: (from: number, to: number) => void;
  reopenTab: () => void;
  capturePreview: (id: string) => void;
}

interface TitleBarTabsProps {
  tabs: TabEntry[];
  metas: Metas;
  activeId: string;
  previews: Record<string, string>;
  canReopen: boolean;
  isLeftOpen: boolean;
  onToggleLeft: () => void;
  resizing: boolean;
  rightIslandWidth: number;
  actions: TitleBarTabActions;
  scenes: ScenesMenuProps;
}

export function TitleBarTabs({
  tabs,
  metas,
  activeId,
  previews,
  canReopen,
  isLeftOpen,
  onToggleLeft,
  resizing,
  rightIslandWidth,
  actions,
  scenes,
}: TitleBarTabsProps) {
  const hasStoplights = useStoplights();
  const captionInset = useCaptionInset();
  const toggleLeft = hasStoplights ? TOGGLE_LEFT : TOGGLE_LEFT_BARE;
  const rowLeft = toggleLeft + (hasLeadingSlot ? LEADING_STEP : 0) + 28 + 4 + 28 + 8;
  const slide = resizing ? '' : 'transition-[left,right] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]';
  const rowRight = LAYOUT.sheetInset + LAYOUT.cardPadding + captionInset + rightIslandWidth + 8;

  return (
    <>
      <div
        className={`absolute top-[8px] z-30 h-[28px] flex items-center gap-[4px] ${slide}`}
        style={{ ...NO_DRAG_REGION, left: toggleLeft }}
      >
        {hasWebLogo && (
          <span className="w-[28px] h-[28px] flex items-center justify-center text-white/90">
            <BasecaseLogo className="w-[18px] h-[18px]" />
          </span>
        )}
        {hasAppMenuButton && (
          <IconButton
            icon={<MenuIcon className="w-[18px] h-[18px]" />}
            title="Menu"
            aria-haspopup="menu"
            onClick={openAppMenu}
          />
        )}
        <IconButton
          icon={<PanelLeftIcon className="w-[18px] h-[18px]" />}
          title={isLeftOpen ? 'Hide sidebar' : 'Show sidebar'}
          shortcut="⌘B"
          onClick={onToggleLeft}
        />
        <ScenesMenu {...scenes} />
      </div>

      <div
        className={`absolute z-30 flex items-stretch pointer-events-none [&>*]:pointer-events-auto ${slide}`}
        style={{ top: TAB_TOP, left: rowLeft, right: rowRight, height: TAB_HEIGHT }}
      >
        <SceneTabs
          tabs={sceneTabsOf(tabs, metas)}
          activeId={activeId}
          previews={previews}
          canReopen={canReopen}
          onSelect={actions.selectTab}
          onNew={() => actions.newScene()}
          onClose={actions.closeTab}
          onCloseOthers={(id) => actions.closeTabs(idsExcept(tabs, id))}
          onCloseRight={(id) => actions.closeTabs(idsAfter(tabs, id))}
          onDuplicate={actions.duplicateTab}
          onRename={actions.renameTab}
          onReorder={actions.reorderTab}
          onReopen={actions.reopenTab}
          onPreview={actions.capturePreview}
        />
      </div>
    </>
  );
}
