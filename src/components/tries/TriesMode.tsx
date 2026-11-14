import React, { useState } from 'react';
import {
  ContextMenu,
  deleteEntry,
  ModeHeader,
  NoMatches,
  useScrollFade,
  type ContextMenuEntry,
} from '../../design-system';
import { hasPrimaryModifier } from '../../utils/os';
import { useSavedScenes } from '../../utils/sceneStore';
import { useStoredTries } from '../../workspace/useStoredTries';
import type { TriesMode as Mode } from '../../workspace/useTriesMode';
import { confirmDeleteTries } from './confirmDeleteTries';
import { TriesGrid } from './TriesGrid';
import { TriesTimeline } from './TriesTimeline';
import { matchingTries, robotGroups } from './triesSearch';
import { clickTry, focusedTry, withoutTries, type ClickMode } from './triesSelection';
import { useTriesKeys } from './useTriesKeys';

interface TriesModeProps {
  active: boolean;
  mode: Mode;
  onForget: (ids: readonly string[]) => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

function clickMode(e: React.MouseEvent): ClickMode {
  if (e.shiftKey) return 'range';

  return hasPrimaryModifier(e) ? 'toggle' : 'one';
}

const keepMenuHere = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

export const TriesMode: React.FC<TriesModeProps> = ({ active, mode, onForget }) => {
  const all = useStoredTries() ?? [];
  const scenes = useSavedScenes();
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const sceneNames = new Map(scenes.map((s) => [s.id, s.name]));
  const groups = robotGroups(matchingTries(all, mode.query, sceneNames), mode.robot);
  const order = groups.flatMap((g) => g.tries.map((t) => t.id));
  const shown = new Set(order);
  const selection = withoutTries(
    mode.selection,
    mode.selection.ids.filter((id) => !shown.has(id)),
  );
  const focus = focusedTry(selection);
  const focused = all.find((t) => t.id === focus) ?? null;

  const remove = (ids: readonly string[]) =>
    confirmDeleteTries(ids, all, (gone) => {
      onForget(gone);
      mode.clear();
    });

  useTriesKeys({
    active,
    onBack: mode.back,
    onDelete: () => selection.ids.length > 0 && remove(selection.ids),
  });

  const onClickTry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    mode.select(clickTry(selection, { id, mode: clickMode(e), order }));
  };

  const onMenuTry = (id: string, e: React.MouseEvent) => {
    keepMenuHere(e);

    const picked = selection.ids.includes(id) ? selection : clickTry(selection, { id, mode: 'one', order });

    mode.select(picked);
    setMenu({ x: e.clientX, y: e.clientY, entries: [deleteEntry(() => remove(picked.ids), '⌫')] });
  };

  return (
    <div
      data-testid="tries-mode"
      className="absolute inset-0 z-[15] flex flex-col bg-[#1b1b1b] rounded-[12px]"
      onContextMenu={keepMenuHere}
    >
      <ModeHeader title="Tries" onDone={mode.leave} />
      <div
        key={mode.robot ?? ''}
        ref={fadeRef}
        style={fadeStyle}
        role="listbox"
        aria-multiselectable
        aria-label="Tries"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[8px] pb-4 select-none"
        onClick={mode.clear}
      >
        {order.length === 0 && mode.query.trim() ? (
          <NoMatches query={mode.query} />
        ) : (
          <TriesGrid groups={groups} selected={selection.ids} onClickTry={onClickTry} onMenuTry={onMenuTry} />
        )}
      </div>
      {focused && <TriesTimeline key={focused.id} stored={focused} active={active} onClose={mode.clear} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};
