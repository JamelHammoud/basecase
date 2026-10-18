import React, { Activity, useState } from 'react';
import { Plus } from 'lucide-react';
import { IconButton, LAYOUT } from '../design-system';
import type { CatalogItem, ScenePart } from '../types/robotics';
import type { RobotPreset } from '../utils/robotImport';
import { LayersView, type LayersViewProps } from './layers/LayersView';
import { LibraryPanel, type LibraryPanelProps } from './LibraryPanel';
import { PartsPanel } from './PartsPanel';
import { RobotsPanel } from './RobotsPanel';

export type LeftTab = 'layers' | 'parts' | 'robots' | 'library';

const VIEW_TITLES: Record<LeftTab, string> = { layers: 'Layers', parts: 'Parts', robots: 'Robots', library: 'Library' };

interface LeftSidebarProps extends Omit<LayersViewProps, 'parts' | 'selectedIds'> {
  open: boolean;
  width: number;
  edge?: React.ReactNode;
  resizing?: boolean;
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  parts: ScenePart[];
  selectedIds: string[];
  onAddCatalogItem: (item: CatalogItem) => void;
  sceneGoal?: string;
  partsSearchRef?: React.MutableRefObject<HTMLInputElement | null>;
  onImportRobot: (preset: RobotPreset | null) => Promise<unknown> | void;
  library: Omit<LibraryPanelProps, 'parts' | 'selectedIds'>;
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

  return <Activity mode={tab === current ? 'visible' : 'hidden'}>{children}</Activity>;
};

const useVisited = (tab: LeftTab) => {
  const [visited, setVisited] = useState<ReadonlySet<LeftTab>>(() => new Set([tab]));

  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));

  return visited;
};

export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const { open, width, tab } = props;
  const visited = useVisited(tab);

  return (
    <aside
      aria-hidden={!open}
      className={`relative h-full shrink-0 overflow-hidden ${
        props.resizing ? '' : 'transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]'
      }`}
      style={{ width: open ? width + LAYOUT.panelGap : 0 }}
    >
      {open && props.edge}
      <div className="sidebar-surface h-full flex flex-col overflow-hidden rounded-[12px]" style={{ width }}>
        <div className="h-[44px] shrink-0 flex items-center justify-between pl-[12px] pr-[8px]">
          <h2 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em]">{VIEW_TITLES[tab]}</h2>
          {tab === 'robots' && (
            <IconButton
              icon={<Plus className="w-4 h-4" />}
              title="Import robot…"
              size="xs"
              onClick={() => props.onImportRobot(null)}
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
              parts={props.parts}
              goal={props.sceneGoal ?? ''}
              searchInputRef={props.partsSearchRef}
            />
          </View>
          <View tab="robots" current={tab} visited={visited}>
            <RobotsPanel onInsert={(r) => props.onImportRobot(r)} />
          </View>
          <View tab="library" current={tab} visited={visited}>
            <LibraryPanel {...props.library} parts={props.parts} selectedIds={props.selectedIds} />
          </View>
        </div>
      </div>
    </aside>
  );
};
