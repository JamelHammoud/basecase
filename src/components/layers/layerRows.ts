import type { ScenePart } from '../../types/robotics';
import { selectionBounds } from '../../utils/selection';

export type LayerRow =
  | { type: 'group'; id: string; name: string; members: ScenePart[] }
  | { type: 'part'; part: ScenePart; inGroup: boolean };

const queryWords = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const matchesWords = (part: ScenePart, words: string[]) => {
  const text = `${part.name} ${part.group?.name ?? ''}`.toLowerCase();

  return words.every((word) => text.includes(word));
};

export function layerRows(parts: ScenePart[], collapsed: ReadonlySet<string>, query = ''): LayerRow[] {
  const words = queryWords(query);
  const searching = words.length > 0;
  const shown = searching ? parts.filter((p) => matchesWords(p, words)) : parts;
  const rows: LayerRow[] = [];
  const seen = new Set<string>();

  for (const part of shown) {
    const group = part.group;

    if (!group) {
      rows.push({ type: 'part', part, inGroup: false });

      continue;
    }

    if (seen.has(group.id)) continue;

    seen.add(group.id);

    const members = parts.filter((m) => m.group?.id === group.id);

    rows.push({ type: 'group', id: group.id, name: group.name, members });

    if (searching || !collapsed.has(group.id)) {
      shown.filter((m) => m.group?.id === group.id).forEach((m) => rows.push({ type: 'part', part: m, inGroup: true }));
    }
  }

  return rows;
}

export function overallSize(parts: ScenePart[]): string | null {
  const solid = parts.filter((p) => p.visible && p.role !== 'reference');

  if (solid.length === 0) {
    return null;
  }

  const { min, max } = selectionBounds(solid);

  return [0, 1, 2].map((i) => Math.round(max[i] - min[i])).join(' × ');
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export function layersTitle(parts: ScenePart[]): string[] {
  const cutouts = parts.filter((p) => p.role === 'cutout').length;

  return cutouts > 0 ? [plural(parts.length, 'part'), plural(cutouts, 'cutout')] : [plural(parts.length, 'part')];
}
