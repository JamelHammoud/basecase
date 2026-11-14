import React, { Activity, useState } from 'react';
import { ErrorBoundary, LAYOUT } from '../design-system';
import type { CatalogItem, ScenePart } from '../types/robotics';
import type { SimReadyAsset } from '../simready/search';
import type { RobotPreset } from '../utils/robotImport';
import { LayersView, type LayersViewProps } from './layers/LayersView';
import { LibraryPanel, type LibraryPanelProps } from './LibraryPanel';
import { NewModelMenu } from './library/NewModelMenu';
import { CasesPanel, type CasesPanelProps } from './cases/CasesPanel';
import { RoutinesPanel, type RoutinesPanelProps } from './routines/RoutinesPanel';
import { OperatePanel, type OperatePanelProps } from './operate/OperatePanel';
import { PartsPanel, type PartsReveal } from './PartsPanel';
import { isPlayTab } from './playViews';
import { PlayNoRobot } from './PlayNoRobot';
import { PlayTabs } from './PlayTabs';

export type LeftTab = 'layers' | 'parts' | 'cases' | 'routines' | 'operate' | 'library';

const VIEW_TITLES: Record<Exclude<LeftTab, 'cases' | 'routines' | 'operate'>, string> = {
  layers: 'Layers',
  parts: 'Parts',
  library: 'Library',
};

const VIEW_NAMES: Record<LeftTab, string> = {
  ...VIEW_TITLES,
  cases: 'Cases',
  routines: 'Routines',
  operate: 'Operate',
};

interface LeftSidebarProps extends Omit<LayersViewProps, 'parts' | 'selectedIds'> {
  open: boolean;
  inert?: boolean;
  width: number;
  edge?: React.ReactNode;
  resizing?: boolean;
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  parts: ScenePart[];
  selectedIds: string[];
  onAddCatalogItem: (item: CatalogItem) => void;
  partsSearchRef?: React.MutableRefObject<HTMLInputElement | null>;
  partsReveal: PartsReveal | null;
  onPartsRevealed: () => void;
  onInsertRobot: (preset: RobotPreset) => Promise<unknown> | void;
  onInsertSimReady: (asset: SimReadyAsset) => Promise<unknown> | void;
  library: Omit<LibraryPanelProps, 'parts' | 'selectedIds'>;
  cases: CasesPanelProps;
  routines: RoutinesPanelProps;
  operate: OperatePanelProps;
}

const View: React.FC<{ tab: LeftTab; current: LeftTab; visited: ReadonlySet<LeftTab>; children: React.ReactNode }> = ({
  tab,
  current,
  visited,
  children,
}) => {
  if (!visited.has(tab)) {
    return null;
  }

  return (
    <Activity mode={tab === current ? 'visible' : 'hidden'}>
      <ErrorBoundary region={VIEW_NAMES[tab]}>{children}</ErrorBoundary>
    </Activity>
  );
};

const useVisited = (tab: LeftTab) => {
  const [visited, setVisited] = useState<ReadonlySet<LeftTab>>(() => new Set([tab]));

  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));

  return visited;
};

export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const { open, width, tab } = props;
  const visited = useVisited(tab);
  const noRobot = isPlayTab(tab) && tab !== 'operate' && !props.cases.cases.hasRobot;
  const playing = noRobot ? 'parts' : tab;

  return (
    <aside
      aria-hidden={!open}
      inert={props.inert}
      className={`relative h-full shrink-0 overflow-hidden ${
        props.resizing ? '' : 'transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]'
      }`}
      style={{ width: open ? width + LAYOUT.panelGap : 0 }}
    >
      {open && props.edge}
      <div className="sidebar-surface h-full flex flex-col overflow-hidden rounded-[12px]" style={{ width }}>
        <ErrorBoundary region="Sidebar">
          <div
            className={`h-[44px] shrink-0 flex items-center justify-between pr-[8px] ${isPlayTab(tab) ? 'pl-[8px]' : 'pl-[12px]'}`}
          >
            {isPlayTab(tab) ? (
              <PlayTabs
                tab={tab}
                onChange={props.onTabChange}
                cases={props.cases.cases}
                routines={props.routines.routines}
              />
            ) : (
              <h2 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em]">{VIEW_TITLES[tab]}</h2>
            )}
            {tab === 'library' && (
              <NewModelMenu
                canSaveSelection={props.selectedIds.length > 0}
                canSaveScene={props.parts.some((p) => p.visible)}
                onSaveModel={props.library.onSaveModel}
                onImport={props.library.onImport}
              />
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col pt-[4px]">
            <View tab="layers" current={tab} visited={visited}>
              <LayersView {...props} />
            </View>
            <View tab="parts" current={tab} visited={visited}>
              <PartsPanel
                onAdd={props.onAddCatalogItem}
                onInsertRobot={props.onInsertRobot}
                onInsertSimReady={props.onInsertSimReady}
                reveal={props.partsReveal}
                onRevealed={props.onPartsRevealed}
                searchInputRef={props.partsSearchRef}
              />
            </View>
            {noRobot && <PlayNoRobot onShowRobots={props.cases.onShowRobots} />}
            <View tab="cases" current={playing} visited={visited}>
              <CasesPanel {...props.cases} />
            </View>
            <View tab="routines" current={playing} visited={visited}>
              <RoutinesPanel {...props.routines} />
            </View>
            <View tab="operate" current={playing} visited={visited}>
              <OperatePanel {...props.operate} />
            </View>
            <View tab="library" current={tab} visited={visited}>
              <LibraryPanel {...props.library} parts={props.parts} selectedIds={props.selectedIds} />
            </View>
          </div>
        </ErrorBoundary>
      </div>
    </aside>
  );
};
