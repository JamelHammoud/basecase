import React, { useEffect, useRef, useState } from 'react';
import {
  ContextMenu,
  ModeHeader,
  SectionHeader,
  deleteEntry,
  useScrollFade,
  type ContextMenuEntry,
} from '../../design-system';
import type { TriesView } from '../../workspace/useTriesView';
import { TagSheet } from './TagSheet';
import { TryTile, type TileScene } from './TryTile';
import { useTriesKeys } from './useTriesKeys';

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2';

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

  const showMenu = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [...view.labelling.entries(view.targets(id)), deleteEntry(() => view.remove(id), '⌫')],
    });
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
      <ModeHeader title="Tries" onDone={view.close} />
      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto" style={fadeStyle}>
        <div ref={body} className={`px-[12px] flex flex-col gap-4 ${timelineOpen ? 'pb-[50vh]' : 'pb-6'}`}>
          {view.groups.map((g) => (
            <section key={g.robot} data-robot={g.robot}>
              <SectionHeader title={g.robot} />
              <div className={GRID}>
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
          ))}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
      {view.labelling.tagging && <TagSheet onTag={view.labelling.tag} onClose={view.labelling.cancelTag} />}
    </div>
  );
};
