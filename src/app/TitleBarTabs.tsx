import type React from 'react';
import { SceneTabs, TAB_HEIGHT, TAB_TOP } from '../components/SceneTabs';
import { ScenesMenu, type ScenesMenuProps } from '../components/ScenesMenu';
import { BasecaseLogo, IconButton, LAYOUT, MenuIcon, NO_DRAG_REGION, PanelLeftIcon } from '../design-system';
import { IS_WINDOWS } from '../utils/os';
import { useCaptionInset } from '../utils/useCaptionInset';
import { useStoplights } from '../utils/useStoplights';
import { idsAfter, idsExcept, sceneTabsOf, type Metas, type TabEntry } from './tabModel';

const AFTER_LIGHTS = LAYOUT.lightsX + LAYOUT.lightsWidth + 8;
const RAIL_SLOT_LEFT = 26 - 14;
const TOGGLE_LEFT_BESIDE_LOGO = LAYOUT.railWidth + LAYOUT.cardPadding - 6;
const SLOT_STEP = 28 + 4;
const hasAppMenuButton = IS_WINDOWS && Boolean(window.electronAPI?.popupAppMenu);
const hasLogo = !hasAppMenuButton;

function logoLeftFor(hasStoplights: boolean) {
  return hasStoplights ? AFTER_LIGHTS : RAIL_SLOT_LEFT;
}

function toggleLeftFor(hasStoplights: boolean) {
  if (hasStoplights) return AFTER_LIGHTS + (hasLogo ? SLOT_STEP : 0);

  return hasLogo ? TOGGLE_LEFT_BESIDE_LOGO : RAIL_SLOT_LEFT;
}

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
  leftWidth: number;
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
  leftWidth,
  onToggleLeft,
  resizing,
  rightIslandWidth,
  actions,
  scenes,
}: TitleBarTabsProps) {
  const hasStoplights = useStoplights();
  const captionInset = useCaptionInset();
  const toggleLeft = toggleLeftFor(hasStoplights);
  const controlsEnd = toggleLeft + (hasAppMenuButton ? SLOT_STEP : 0) + 28 + 4 + 28 + 8;
  const canvasLeft = LAYOUT.railWidth + leftWidth + LAYOUT.panelGap;
  const rowLeft = isLeftOpen ? Math.max(controlsEnd, canvasLeft) : controlsEnd;
  const slide = resizing ? '' : 'transition-[left,right] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]';
  const rowRight = LAYOUT.sheetInset + LAYOUT.cardPadding + captionInset + rightIslandWidth + 8;

  return (
    <>
      {hasLogo && (
        <span
          className={`absolute top-[8px] z-30 w-[28px] h-[28px] flex items-center justify-center text-white/90 ${slide}`}
          style={{ left: logoLeftFor(hasStoplights) }}
        >
          <BasecaseLogo className="w-[18px] h-[18px]" />
        </span>
      )}
      <div
        className={`absolute top-[8px] z-30 h-[28px] flex items-center gap-[4px] ${slide}`}
        style={{ ...NO_DRAG_REGION, left: toggleLeft }}
      >
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
