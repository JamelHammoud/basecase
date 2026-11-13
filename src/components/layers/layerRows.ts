import { isBooleanPart, operandsOf } from '../../booleans/parts';
import type { ScenePart } from '../../types/robotics';
import { selectionBounds } from '../../utils/selection';
import { plural } from '../../../electron/plural.mjs';

export interface PartLayerRow {
  type: 'part';
  part: ScenePart;
  depth: number;
  operandOf?: string;
  collapsed?: boolean;
}

export type LayerRow = { type: 'group'; id: string; name: string; members: ScenePart[] } | PartLayerRow;

interface RowContext {
  words: string[];
  collapsed: ReadonlySet<string>;
}

const queryWords = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const matchesWords = (part: ScenePart, words: string[]) => {
  const text = `${part.name} ${part.group?.name ?? ''}`.toLowerCase();

  return words.every((word) => text.includes(word));
};

const matchesDeep = (part: ScenePart, words: string[]): boolean =>
  matchesWords(part, words) || operandsOf(part).some((operand) => matchesDeep(operand, words));

function partRows(part: ScenePart, depth: number, ctx: RowContext, operandOf?: string): PartLayerRow[] {
  const row: PartLayerRow = { type: 'part', part, depth, ...(operandOf ? { operandOf } : {}) };

  if (!isBooleanPart(part)) return [row];

  const searching = ctx.words.length > 0;
  const closed = !searching && ctx.collapsed.has(part.id);
  const operands = closed ? [] : part.boolean.operands.filter((o) => !searching || matchesDeep(o, ctx.words));

  return [{ ...row, collapsed: closed }, ...operands.flatMap((o) => partRows(o, depth + 1, ctx, part.id))];
}

export function layerRows(parts: ScenePart[], collapsed: ReadonlySet<string>, query = ''): LayerRow[] {
  const words = queryWords(query);
  const searching = words.length > 0;
  const shown = searching ? parts.filter((p) => matchesDeep(p, words)) : parts;
  const ctx: RowContext = { words, collapsed };
  const rows: LayerRow[] = [];
  const seen = new Set<string>();

  for (const part of shown) {
    const group = part.group;

    if (!group) {
      rows.push(...partRows(part, 0, ctx));

      continue;
    }

    if (seen.has(group.id)) continue;

    seen.add(group.id);

    const members = parts.filter((m) => m.group?.id === group.id);

    rows.push({ type: 'group', id: group.id, name: group.name, members });

    if (searching || !collapsed.has(group.id)) {
      shown.filter((m) => m.group?.id === group.id).forEach((m) => rows.push(...partRows(m, 1, ctx)));
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

export function layersTitle(parts: ScenePart[]): string[] {
  const cutouts = parts.filter((p) => p.role === 'cutout').length;

  return cutouts > 0 ? [plural(parts.length, 'part'), plural(cutouts, 'cutout')] : [plural(parts.length, 'part')];
}
