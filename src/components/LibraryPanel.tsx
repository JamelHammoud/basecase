import React, { useState } from 'react';
import { ContextMenu, NoMatches, SearchField, useScrollFade, type ContextMenuEntry } from '../design-system';
import type { CustomModelDefinition, ScenePart } from '../types/robotics';
import { modelNote } from '../utils/libraryParts';
import { useSavedScenes } from '../utils/sceneStore';
import { useStoredTries } from '../workspace/useStoredTries';
import { ModelsSection, type SectionState } from './library/sections';
import { TriesSection } from './library/TriesSection';
import { matchingTries, robotGroups } from './tries/triesSearch';

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
  query: string;
  onQueryChange: (query: string) => void;
  triesRobot: string | null;
  onOpenTries: (robot: string) => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

const matcher = (query: string) => {
  const q = query.trim().toLowerCase();

  return (...fields: Array<string | undefined>) => !q || fields.some((f) => f?.toLowerCase().includes(q));
};

export const LibraryPanel: React.FC<LibraryPanelProps> = (props) => {
  const { query, onQueryChange: setQuery } = props;
  const scenes = useSavedScenes();
  const stored = useStoredTries();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const searching = query.trim() !== '';
  const matches = matcher(query);
  const models = props.customModels.filter((m) => matches(m.name, modelNote(m)));
  const sceneNames = new Map(scenes.map((s) => [s.id, s.name]));
  const tryGroups = robotGroups(matchingTries(stored ?? [], query, sceneNames));
  const noModels = searching && models.length === 0;
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
        {noModels && tryGroups.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          <div className="px-[8px] pb-4">
            {!noModels && <ModelsSection props={props} models={models} state={state} />}
            <TriesSection groups={tryGroups} current={props.triesRobot} onOpen={props.onOpenTries} />
          </div>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};
