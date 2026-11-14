import React, { useEffect, useRef, useState } from 'react';
import { ContextMenu, ModeHeader, SectionHeader, useScrollFade, type ContextMenuEntry } from '../../design-system';
import type { TrySummary } from '../../cases/tryFile';
import type { DatasetMode } from '../../workspace/useDatasetMode';
import { EARLIER_TRIES } from '../../workspace/useDatasetExport';
import { tryGroups, type TriesView } from '../../workspace/useTriesView';
import { DatasetPane } from './DatasetPane';
import { TryTile, type TileScene } from './TryTile';
import { useTriesKeys } from './useTriesKeys';

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2';

interface TriesModeProps {
  active: boolean;
  view: TriesView;
  mode: DatasetMode;
  timelineOpen: boolean;
  sceneId: string;
  scene: TileScene;
}

interface TileGridProps {
  tries: TrySummary[];
  view: TriesView;
  sceneId: string;
  scene: TileScene;
  showMenu: (id: string) => (e: React.MouseEvent) => void;
}

const TileGrid: React.FC<TileGridProps> = ({ tries, view, sceneId, scene, showMenu }) => (
  <div className={GRID}>
    {tries.map((t) => (
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
);

export const TriesMode: React.FC<TriesModeProps> = ({ active, view, mode, timelineOpen, sceneId, scene }) => {
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const body = useRef<HTMLDivElement | null>(null);
  const groups = mode.dataset ? tryGroups(mode.fitting) : view.groups;
  const grid = { view, sceneId, scene };

  useTriesKeys(view, timelineOpen, active);

  useEffect(() => {
    if (!view.robot) return;

    body.current?.querySelector(`[data-robot="${CSS.escape(view.robot)}"]`)?.scrollIntoView({ block: 'start' });
  }, [view.robot]);

  const showMenu = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entries: mode.menu(id) });
  };

  return (
    <div
      data-testid="tries-mode"
      data-dataset={mode.dataset?.id}
      className="absolute inset-0 z-20 flex flex-col bg-[#1b1b1b] rounded-[12px]"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ModeHeader title={mode.dataset?.name ?? 'Tries'} onDone={view.close} />
      {mode.dataset && mode.actions && (
        <DatasetPane dataset={mode.dataset} members={mode.members} actions={mode.actions} />
      )}
      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto" style={fadeStyle}>
        <div ref={body} className={`px-[12px] flex flex-col gap-4 ${timelineOpen ? 'pb-[50vh]' : 'pb-6'}`}>
          {groups.map((g) => (
            <section key={g.robot} data-robot={g.robot}>
              <SectionHeader title={g.robot} />
              <TileGrid tries={g.tries} showMenu={showMenu} {...grid} />
            </section>
          ))}
          {mode.apart.length > 0 && (
            <section data-testid="dataset-apart" className="flex flex-col gap-2">
              <p className="pt-2 text-[13px] text-white/60">{EARLIER_TRIES}</p>
              <TileGrid tries={mode.apart} showMenu={showMenu} {...grid} />
            </section>
          )}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};
