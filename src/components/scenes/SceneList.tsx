import React, { useState } from 'react';
import { SearchField, useScrollFade } from '../../design-system';
import type { SavedSceneSummary } from '../../types/robotics';
import { groupByDate } from '../../utils/dateGroups';
import { SceneRow } from './SceneRow';

export interface SceneListProps {
  scenes: SavedSceneSummary[];
  query: string;
  onQuery: (query: string) => void;
  currentSceneId: string;
  renaming: string | null;
  onOpen: (scene: SavedSceneSummary) => void;
  onRename: (scene: SavedSceneSummary, name: string) => void;
  onMenu: (scene: SavedSceneSummary, e: React.MouseEvent) => void;
}

const matches = (scene: SavedSceneSummary, q: string) =>
  !q || scene.name.toLowerCase().includes(q) || scene.globalGoal?.toLowerCase().includes(q);

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

function scrollRowIntoView(id: string | undefined) {
  if (id) document.querySelector(`[data-scene-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

export const SceneList: React.FC<SceneListProps> = (props) => {
  const { scenes, query, onQuery, currentSceneId, renaming } = props;
  const [highlight, setHighlight] = useState(0);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const q = query.trim().toLowerCase();
  const groups = groupByDate(
    scenes.filter((s) => matches(s, q)),
    new Date(),
  );
  const flat = groups.flatMap((g) => g.items);
  const index = Math.min(highlight, flat.length - 1);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const step = STEP[e.key];

    if (step) {
      e.preventDefault();

      const next = Math.max(0, Math.min(flat.length - 1, index + step));

      setHighlight(next);
      scrollRowIntoView(flat[next]?.id);

      return;
    }

    if (e.key === 'Enter' && flat[index]) props.onOpen(flat[index]);
  };

  return (
    <div className="w-[340px] flex flex-col max-h-[min(560px,75vh)]">
      <div className="p-[6px] pb-[4px] shrink-0">
        <SearchField
          autoFocus
          value={query}
          onChange={(value) => {
            onQuery(value);
            setHighlight(0);
          }}
          onKeyDown={onSearchKey}
          placeholder="Search scenes"
          aria-label="Search scenes"
        />
      </div>
      <div ref={fadeRef} style={fadeStyle} className="min-h-0 overflow-y-auto overflow-x-hidden px-[6px] pb-[6px]">
        {flat.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-white/45">
            {q ? `No matches for “${query.trim()}”` : 'No scenes'}
          </div>
        )}
        {groups.map((g, gi) => (
          <section key={g.label} className={gi > 0 ? 'mt-2' : ''}>
            <h3 className="px-[10px] pt-[6px] pb-[4px] text-[12px] font-medium text-white/40 select-none">{g.label}</h3>
            {g.items.map((s) => (
              <SceneRow
                key={s.id}
                scene={s}
                current={s.id === currentSceneId}
                highlighted={flat[index]?.id === s.id}
                renaming={renaming === s.id}
                onOpen={() => props.onOpen(s)}
                onRename={(name) => props.onRename(s, name)}
                onMenu={(e) => props.onMenu(s, e)}
                onHover={() => setHighlight(flat.indexOf(s))}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
