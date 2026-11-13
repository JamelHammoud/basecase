import { useState } from 'react';
import { confirmAction } from '../design-system/confirmStore';
import type { MarkMove, MarkTool, NewMark } from '../three/viewport/types';
import type { SceneMark } from '../types/robotics';
import { DEFAULT_MARK_COLOR, markColorOf } from '../utils/markColors';
import { newId, stamp } from './helpers';
import type { ShowToast } from './types';
import type { SceneDocument } from './useSceneDocument';

interface MarkOptions {
  docs: Pick<SceneDocument, 'project' | 'projectRef' | 'commitMarks'>;
  showToast: ShowToast;
  selection: { selectedId: string | null; setSelectedId: (id: string | null) => void };
  tool: { current: MarkTool; set: (tool: MarkTool) => void };
}

export const markCount = (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`;

const markName = (mark: SceneMark) => (mark.label ? `“${mark.label}”` : 'mark');

export function useMarkState() {
  const [marking, setMarkingState] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkTool>('marker');
  const setMarking = (on: boolean) => {
    setMarkingState(on);

    if (on) return;

    setSelectedId(null);
    setTool('marker');
  };

  return {
    marking,
    setMarking,
    selection: { selectedId, setSelectedId },
    tool: { current: tool, set: setTool },
  };
}

export function useMarks({ docs, showToast, selection, tool }: MarkOptions) {
  const { project, projectRef, commitMarks } = docs;
  const { selectedId, setSelectedId } = selection;
  const [drawColor, setDrawColor] = useState(DEFAULT_MARK_COLOR);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [liveColor, setLiveColor] = useState<string | null>(null);
  const marks = project.marks ?? [];
  const selected = marks.find((m) => m.id === selectedId) ?? null;
  const current = () => projectRef.current.marks ?? [];

  const patch = (id: string, change: Partial<SceneMark>) =>
    commitMarks(current().map((m) => (m.id === id ? { ...m, ...change } : m)));

  const add = ({ points, partIds, view }: NewMark) => {
    const mark: SceneMark = { id: newId('mark'), points, partIds, color: drawColor, view, createdAt: stamp() };

    commitMarks([...current(), mark]);
    setSelectedId(mark.id);
    setFreshId(mark.id);
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    setFreshId(null);
  };

  const setLabel = (id: string, text: string) => {
    const mark = current().find((m) => m.id === id);
    const label = text.trim();

    if (!mark || (mark.label ?? '') === label) return;

    patch(id, { label: label || undefined });
  };

  const setColor = (hex: string, live = false) => {
    setDrawColor(hex);
    setLiveColor(live ? hex : null);

    if (live || !selected || markColorOf(selected) === hex) return;

    patch(selected.id, { color: hex });
  };

  const remove = (id: string) => {
    const before = current();
    const mark = before.find((m) => m.id === id);

    if (!mark) return;

    confirmAction({
      title: `Delete ${markName(mark)}?`,
      onConfirm: () => {
        commitMarks(current().filter((m) => m.id !== id));
        select(null);
        showToast(`Deleted ${markName(mark)}`, {
          tone: 'neutral',
          action: { label: 'Undo', onClick: () => commitMarks(before) },
        });
      },
    });
  };

  const move = ({ id, points, partIds }: MarkMove) => patch(id, { points, partIds });

  const setTool = (next: MarkTool) => {
    tool.set(next);

    if (next === 'eraser') select(null);
  };

  const erase = (ids: string[]) => {
    const before = current();
    const gone = new Set(ids);
    const erased = before.filter((m) => gone.has(m.id));

    if (!erased.length) return;

    commitMarks(before.filter((m) => !gone.has(m.id)));

    if (selectedId && gone.has(selectedId)) select(null);

    showToast(erased.length === 1 ? `Erased ${markName(erased[0])}` : `Erased ${markCount(erased.length)}`, {
      tone: 'neutral',
      action: { label: 'Undo', onClick: () => commitMarks(before) },
    });
  };

  const deleteAll = () => {
    const before = current();

    if (!before.length) return;

    const name = before.length === 1 ? markName(before[0]) : markCount(before.length);

    confirmAction({
      title: `Delete ${name}?`,
      onConfirm: () => {
        commitMarks([]);
        select(null);
        showToast(`Deleted ${name}`, {
          tone: 'neutral',
          action: { label: 'Undo', onClick: () => commitMarks(before) },
        });
      },
    });
  };

  return {
    marks,
    selected,
    freshId,
    color: liveColor ?? (selected ? markColorOf(selected) : drawColor),
    tool: tool.current,
    setTool,
    add,
    select,
    setLabel,
    setColor,
    remove,
    move,
    erase,
    deleteAll,
  };
}

export type Marks = ReturnType<typeof useMarks>;
