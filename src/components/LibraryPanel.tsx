import React, { useState } from 'react';
import {
  ContextMenu,
  NoMatches,
  SearchField,
  deleteEntry,
  useScrollFade,
  type ContextMenuEntry,
} from '../design-system';
import type { CustomModelDefinition, ScenePart } from '../types/robotics';
import { modelNote } from '../utils/libraryParts';
import { useTries } from '../cases/tryStore';
import { textMatcher, tryMatches } from '../cases/tryQuery';
import type { Dataset } from '../datasets/datasetFile';
import { tryGroups } from '../workspace/useTriesView';
import { DatasetsSection } from './library/DatasetsSection';
import { ModelsSection, type SectionState } from './library/sections';
import { TriesSection } from './library/TriesSection';

export interface LibraryPanelProps {
  customModels: CustomModelDefinition[];
  parts: ScenePart[];
  selectedIds: string[];
  onInsertModel: (model: CustomModelDefinition) => void;
  onRenameModel: (model: CustomModelDefinition, name: string) => void;
  onDuplicateModel: (model: CustomModelDefinition) => void;
  onDeleteModel: (model: CustomModelDefinition) => void;
  onSaveModel: (mode: 'selected' | 'all') => void;
  onImport: () => void;
  onOpenTries: (robot: string) => void;
  query: string;
  onQuery: (query: string) => void;
  datasets: Dataset[];
  onOpenDataset: (dataset: Dataset) => void;
  onDeleteDataset: (dataset: Dataset) => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

export const LibraryPanel: React.FC<LibraryPanelProps> = (props) => {
  const { query, onQuery: setQuery } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const searching = query.trim() !== '';
  const matches = textMatcher(query);
  const models = props.customModels.filter((m) => matches(m.name, modelNote(m)));
  const tries = tryGroups((useTries() ?? []).filter(tryMatches(query)));
  const datasets = props.datasets.filter((d) => matches(d.name, d.task));
  const state: SectionState = {
    renaming,
    setRenaming,
    showMenu: (entries) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY, entries });
    },
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;

    if (query) setQuery('');
    else e.currentTarget.blur();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          value={query}
          onChange={setQuery}
          onKeyDown={onSearchKey}
          placeholder="Search library"
          aria-label="Search library"
        />
      </div>

      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fadeStyle}>
        {searching && models.length === 0 && tries.length === 0 && datasets.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          <div className="px-[8px] pb-4">
            {(!searching || models.length > 0) && <ModelsSection props={props} models={models} state={state} />}
            <TriesSection groups={tries} onOpen={props.onOpenTries} />
            <DatasetsSection
              datasets={datasets}
              onOpen={props.onOpenDataset}
              onMenu={(d) => state.showMenu([deleteEntry(() => props.onDeleteDataset(d))])}
            />
          </div>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};
