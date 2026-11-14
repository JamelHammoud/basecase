import type { DataLayerRow } from '../../dataLayers/store';
import type { LayerRow } from './layerRows';

export interface DataRow {
  type: 'data';
  layer: DataLayerRow;
  depth: number;
}

export type LayerListRow = LayerRow | DataRow;

const belongsTo = (row: LayerRow, owner: string) =>
  row.type === 'group' ? row.id === owner : row.part.id === owner || row.part.group?.id === owner;

function ownerEnd(rows: LayerListRow[], owner: string): { at: number; depth: number } | null {
  let at = -1;
  let depth = 0;

  rows.forEach((row, i) => {
    if (row.type === 'data' || !belongsTo(row, owner)) return;

    if (at < 0) depth = row.type === 'group' ? 1 : row.depth + 1;

    at = i;
  });

  return at < 0 ? null : { at, depth };
}

const isTrailing = (row: LayerListRow) => row.type === 'data' || (row.type === 'part' && !!row.operandOf);

const matches = (layer: DataLayerRow, query: string) => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return words.every((word) => layer.name.toLowerCase().includes(word));
};

export function withDataRows(
  rows: LayerRow[],
  layers: DataLayerRow[],
  view: { collapsed: ReadonlySet<string>; query: string },
): LayerListRow[] {
  const out: LayerListRow[] = [...rows];
  const searching = view.query.trim() !== '';
  const loose: DataRow[] = [];

  for (const layer of layers) {
    if (!matches(layer, view.query)) continue;

    const owner = layer.owner;

    if (owner && !searching && view.collapsed.has(owner)) continue;

    const end = owner ? ownerEnd(out, owner) : null;

    if (!end) {
      loose.push({ type: 'data', layer, depth: 0 });

      continue;
    }

    let at = end.at + 1;

    while (at < out.length && isTrailing(out[at])) at++;

    out.splice(at, 0, { type: 'data', layer, depth: end.depth });
  }

  return [...out, ...loose];
}
