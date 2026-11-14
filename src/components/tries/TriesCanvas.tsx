import React, { useEffect, useRef, useState } from 'react';
import { ContextMenu, deleteEntry, ModeHeader, SectionHeader, type ContextMenuEntry } from '../../design-system';
import { useStoredTimeline } from '../../workspace/useStoredTimeline';
import { useStoredTries } from '../../workspace/useStoredTries';
import type { TriesMode } from '../../workspace/useTriesMode';
import { TryTimeline } from '../simulate/TryTimeline';
import { matchTries, pick, robotGroups, type Picked } from './triesLibrary';
import { TryTile } from './TryTile';
import { useTriesKeys } from './useTriesKeys';
import { confirmTriesDelete } from './confirmTriesDelete';

interface TriesCanvasProps {
  active: boolean;
  mode: TriesMode;
  onDelete: (ids: string[]) => void;
}

const NONE: Picked = { ids: [], anchor: null };

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2';

export const TriesCanvas: React.FC<TriesCanvasProps> = ({ active, mode, onDelete }) => {
  const all = useStoredTries();
  const groups = robotGroups(all.filter(matchTries(mode.query)));
  const order = groups.flatMap((g) => g.tries.map((t) => t.id));
  const [picked, setPicked] = useState<Picked>(NONE);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ids = picked.ids.filter((id) => order.includes(id));
  const primary = picked.anchor && ids.includes(picked.anchor) ? picked.anchor : (ids.at(-1) ?? null);
  const timeline = useStoredTimeline(primary, () => setPicked(NONE));

  const remove = (gone: string[]) =>
    confirmTriesDelete(gone, (deleted) => {
      setPicked(NONE);
      onDelete(deleted);

      if (all.every((t) => deleted.includes(t.id))) mode.close();
    });

  useTriesKeys({ active, picked: ids, onClear: () => setPicked(NONE), onDelete: remove, onLeave: mode.close });

  useEffect(() => {
    const group = mode.focus && scrollRef.current?.querySelector(`[data-robot="${CSS.escape(mode.focus)}"]`);

    if (group) group.scrollIntoView({ block: 'start' });
  }, [mode.focus]);

  const onPick = (id: string) => (e: React.MouseEvent) =>
    setPicked(pick(order, { ids, anchor: picked.anchor }, { id, shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey }));

  const onMenu = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();

    const targets = ids.includes(id) ? ids : [id];

    if (!ids.includes(id)) setPicked({ ids: [id], anchor: id });

    setMenu({ x: e.clientX, y: e.clientY, items: [deleteEntry(() => remove(targets))] });
  };

  return (
    <section data-testid="tries-mode" className="absolute inset-0 z-30 flex flex-col bg-[#1b1b1b] rounded-[12px]">
      <ModeHeader title="Tries" onDone={mode.close} />
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.robot} data-robot={g.robot} className="flex flex-col gap-1">
            <SectionHeader title={g.robot} />
            <div className={GRID}>
              {g.tries.map((t) => (
                <TryTile
                  key={t.id}
                  record={t}
                  selected={ids.includes(t.id)}
                  onPick={onPick(t.id)}
                  onMenu={onMenu(t.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {active && timeline.view.open && (
        <div className="shrink-0 flex justify-center px-3 pb-3">
          <TryTimeline timeline={timeline.view} nameOf={timeline.nameOf} />
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </section>
  );
};
