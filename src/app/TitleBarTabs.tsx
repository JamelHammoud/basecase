import { PanelLeft } from 'lucide-react';
import { SceneTabs, TAB_HEIGHT, TAB_TOP } from '../components/SceneTabs';
import { IconButton, LAYOUT, NO_DRAG_REGION } from '../design-system';
import { useStoplights } from '../utils/useStoplights';
import { idsAfter, idsExcept, sceneTabsOf, type Metas, type TabEntry } from './tabModel';

const TOGGLE_LEFT = LAYOUT.lightsX + LAYOUT.lightsWidth + 8;
const TOGGLE_LEFT_BARE = 26 - 14;

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
}: TitleBarTabsProps) {
  const hasStoplights = useStoplights();
  const toggleLeft = hasStoplights ? TOGGLE_LEFT : TOGGLE_LEFT_BARE;
  const rowLeft = toggleLeft + 28 + 8;
  const slide = resizing ? '' : 'transition-[left,right] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]';
  const rowRight = LAYOUT.sheetInset + LAYOUT.cardPadding + rightIslandWidth + 8;

  return (
    <>
      <div
        className={`absolute top-[8px] z-30 h-[28px] flex items-center ${slide}`}
        style={{ ...NO_DRAG_REGION, left: toggleLeft }}
      >
        <IconButton
          icon={<PanelLeft className="w-4 h-4" />}
          title={isLeftOpen ? 'Hide sidebar' : 'Show sidebar'}
          shortcut="⌘B"
          onClick={onToggleLeft}
        />
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
