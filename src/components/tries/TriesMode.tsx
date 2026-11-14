import React, { useEffect, useRef, useState } from 'react';
import {
  ContextMenu,
  ModeHeader,
  SearchField,
  SectionHeader,
  deleteEntry,
  moreLikeThisEntry,
  useScrollFade,
  type ContextMenuEntry,
} from '../../design-system';
import type { TriesView } from '../../workspace/useTriesView';
import { TRY_SEARCH_EXAMPLE } from './trySearchExample';
import { TRIES_GRID, TryResults } from './TryResults';
import { TryTile, type TileScene } from './TryTile';
import { useTriesKeys } from './useTriesKeys';

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

interface TriesModeProps {
  active: boolean;
  view: TriesView;
  timelineOpen: boolean;
  sceneId: string;
  scene: TileScene;
}

export const TriesMode: React.FC<TriesModeProps> = ({ active, view, timelineOpen, sceneId, scene }) => {
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const body = useRef<HTMLDivElement | null>(null);

  useTriesKeys(view, timelineOpen, active);

  useEffect(() => {
    if (!view.robot) return;

    body.current?.querySelector(`[data-robot="${CSS.escape(view.robot)}"]`)?.scrollIntoView({ block: 'start' });
  }, [view.robot]);

  const searching = view.query.trim() !== '';
  const summaries = new Map(view.groups.flatMap((g) => g.tries.map((t) => [t.id, t] as const)));

  const showMenu = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [moreLikeThisEntry(() => view.like(id)), deleteEntry(() => view.remove(id), '⌫')],
    });
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;

    if (view.query) {
      view.setQuery('');

      return;
    }

    e.stopPropagation();
    e.currentTarget.blur();
  };

  return (
    <div
      data-testid="tries-mode"
      className="absolute inset-0 z-20 flex flex-col bg-[#1b1b1b] rounded-[12px]"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ModeHeader
        title="Tries"
        onDone={view.close}
        actions={
          <SearchField
            value={view.query}
            onChange={view.setQuery}
            onKeyDown={onSearchKey}
            placeholder={TRY_SEARCH_EXAMPLE}
            aria-label="Search tries"
            className="w-[300px]"
          />
        }
      />
      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto" style={fadeStyle}>
        <div ref={body} className={`px-[12px] flex flex-col gap-4 ${timelineOpen ? 'pb-[50vh]' : 'pb-6'}`}>
          {searching ? (
            <TryResults
              query={view.query}
              hits={view.hits}
              summaries={summaries}
              selected={view.selected}
              sceneId={sceneId}
              scene={scene}
              onPick={view.pick}
              onMenu={showMenu}
            />
          ) : (
            view.groups.map((g) => (
              <section key={g.robot} data-robot={g.robot}>
                <SectionHeader title={g.robot} />
                <div className={TRIES_GRID}>
                  {g.tries.map((t) => (
                    <TryTile
                      key={t.id}
                      summary={t}
                      scene={t.sceneId === sceneId ? scene : null}
                      selected={view.selected.includes(t.id)}
                      onPick={(keys) => view.pick(t.id, keys)}
                      onMenu={showMenu(t.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};
