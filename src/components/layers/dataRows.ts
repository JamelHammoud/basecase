import type { DataLayerRow } from '../../dataLayers/store';
import type { LayerRow } from './layerRows';

export interface DataRow {
  type: 'data';
  layer: DataLayerRow;
  depth: number;
}

export type LayerListRow = LayerRow | DataRow;

interface OwnerPosition {
  at: number;
  depth: number;
}

function ownerPositions(rows: LayerRow[]): Map<string, OwnerPosition> {
  const positions = new Map<string, OwnerPosition>();
  let at = rows.length;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const owners = row.type === 'group' ? [row.id] : [row.part.id, row.part.group?.id];
    const depth = row.type === 'group' ? 1 : row.depth + 1;

    for (const owner of owners) {
      if (owner) positions.set(owner, { at: positions.get(owner)?.at ?? at, depth });
    }

    if (row.type === 'group' || !row.operandOf) at = i;
  }

  return positions;
}

export function withDataRows(
  rows: LayerRow[],
  layers: DataLayerRow[],
  view: { collapsed: ReadonlySet<string>; query: string },
): LayerListRow[] {
  if (layers.length === 0) return [...rows];

  const positions = ownerPositions(rows);
  const insertions = new Map<number, DataRow[]>();
  const words = view.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const loose: DataRow[] = [];

  for (const layer of layers) {
    const name = layer.name.toLowerCase();

    if (!words.every((word) => name.includes(word))) continue;

    const owner = layer.owner;

    if (owner && !searching && view.collapsed.has(owner)) continue;

    const end = owner ? positions.get(owner) : undefined;

    if (!end) {
      loose.push({ type: 'data', layer, depth: 0 });

      continue;
    }

    const bucket = insertions.get(end.at) ?? [];

    bucket.push({ type: 'data', layer, depth: end.depth });
    insertions.set(end.at, bucket);
  }

  const out: LayerListRow[] = [];

  rows.forEach((row, i) => {
    for (const data of insertions.get(i) ?? []) out.push(data);

    out.push(row);
  });

  for (const data of insertions.get(rows.length) ?? []) out.push(data);

  return [...out, ...loose];
}
