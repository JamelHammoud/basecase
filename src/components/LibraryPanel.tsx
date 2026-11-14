import React, { useState } from 'react';
import { ContextMenu, NoMatches, SearchField, useScrollFade, type ContextMenuEntry } from '../design-system';
import type { CustomModelDefinition, ScenePart } from '../types/robotics';
import { modelNote } from '../utils/libraryParts';
import { ModelsSection, type SectionState } from './library/sections';
import { TriesSection } from './tries/TriesSection';
import { matchTries, robotGroups } from './tries/triesLibrary';
import { useStoredTries } from '../workspace/useStoredTries';

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
  onOpenTries: (robot: string, query: string) => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

const matcher = (query: string) => {
  const q = query.trim().toLowerCase();

  return (...fields: Array<string | undefined>) => !q || fields.some((f) => f?.toLowerCase().includes(q));
};

export const LibraryPanel: React.FC<LibraryPanelProps> = (props) => {
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const searching = query.trim() !== '';
  const matches = matcher(query);
  const models = props.customModels.filter((m) => matches(m.name, modelNote(m)));
  const tries = robotGroups(useStoredTries().filter(matchTries(query)));
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
        {searching && models.length === 0 && tries.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          <div className="px-[8px] pb-4">
            {(!searching || models.length > 0) && <ModelsSection props={props} models={models} state={state} />}
            {tries.length > 0 && <TriesSection groups={tries} onOpen={(robot) => props.onOpenTries(robot, query)} />}
          </div>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};
