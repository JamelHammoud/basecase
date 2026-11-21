import { parentBoolean } from '../../booleans/parts';
import type { ScenePart } from '../../types/robotics';
import type { LayerListRow } from './dataRows';

export const LAYER_ROW_PITCH = 33;
export const LAYER_ROW_HEIGHT = 32;

export interface LayerPosition {
  listPosition?: number;
  listSize?: number;
}

interface LayerRange {
  start: number;
  end: number;
}

type LayerSlot =
  { type: 'space'; key: string; height: number } | { type: 'row'; key: string; index: number; row: LayerListRow };

const rowKey = (row: LayerListRow) => {
  if (row.type === 'part') return `part:${row.part.id}`;

  return row.type === 'group' ? `group:${row.id}` : `data:${row.layer.id}`;
};

export function layerRange(count: number, top: number, height: number): LayerRange {
  const offset = Math.max(0, top);
  const maximumStart = Math.max(0, count - Math.ceil(height / LAYER_ROW_PITCH));

  return {
    start: Math.min(maximumStart, Math.max(0, Math.floor(offset / LAYER_ROW_PITCH) - 6)),
    end: Math.min(count, Math.ceil((offset + height) / LAYER_ROW_PITCH) + 6),
  };
}

export function layerSlots(rows: LayerListRow[], range: LayerRange, editing: string | null): LayerSlot[] {
  const indices = new Set(
    Array.from({ length: Math.max(0, range.end - range.start) }, (_, index) => range.start + index),
  );
  const pinned = rows.findIndex(
    (row) => row.type !== 'data' && (row.type === 'group' ? row.id : row.part.id) === editing,
  );

  if (pinned >= 0) indices.add(pinned);

  const slots: LayerSlot[] = [];
  let cursor = 0;

  for (const index of [...indices].sort((a, b) => a - b)) {
    if (index > cursor)
      slots.push({ type: 'space', key: `space:${cursor}`, height: (index - cursor) * LAYER_ROW_PITCH - 1 });

    slots.push({ type: 'row', key: rowKey(rows[index]), index, row: rows[index] });
    cursor = index + 1;
  }

  if (cursor < rows.length)
    slots.push({ type: 'space', key: `space:${cursor}`, height: (rows.length - cursor) * LAYER_ROW_PITCH - 1 });

  return slots;
}

export function selectedRowIndex(rows: LayerListRow[], parts: ScenePart[], id: string | undefined): number {
  if (!id) return -1;

  const direct = rows.findIndex((row) => row.type === 'part' && row.part.id === id);

  if (direct >= 0) return direct;

  const parent = parentBoolean(parts, id);

  if (parent) return selectedRowIndex(rows, parts, parent.id);

  const group = parts.find((part) => part.id === id)?.group;

  return group ? rows.findIndex((row) => row.type === 'group' && row.id === group.id) : -1;
}
