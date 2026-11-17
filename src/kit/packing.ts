import { boardPurchases } from '../wiring/boardPurchases';
import type { ElectronicsBoard } from '../wiring/boardTypes';
import type { GuidePlan } from '../guide/guideTypes';
import type { BomLine } from '../utils/bom';
import type { PackingRow } from './types';

export function packDemand(
  lines: Array<Pick<BomLine, 'key' | 'name' | 'qty' | 'unit' | 'partIds'>>,
  guide: GuidePlan,
  board?: ElectronicsBoard,
): PackingRow[] {
  const first = new Map<string, { module: string; step: number; index: number }>();
  const boardCounts = new Map(boardPurchases(board).map((item) => [item.key, item.qty]));

  guide.steps.forEach((step, index) => {
    for (const id of step.partIds) {
      if (!first.has(id)) first.set(id, { module: step.moduleId, step: step.number, index: index + 1 });
    }
  });

  return lines.flatMap((line) => {
    const rows = new Map<number | null, PackingRow>();
    const assign = (qty: number, partIds: string[], location: ReturnType<typeof first.get>) => {
      const index = location?.index ?? null;
      const row = rows.get(index) ?? {
        key: line.key,
        name: line.name,
        qty: 0,
        unit: line.unit,
        partIds: [],
        module: location?.module ?? null,
        step: location?.step ?? null,
        index,
      };

      row.qty += qty;
      row.partIds.push(...partIds);
      rows.set(index, row);
    };
    const boardQty = boardCounts.get(line.key) ?? 0;
    const ids =
      line.unit === 'pcs'
        ? line.partIds.flatMap((id) =>
            id === board?.partId && boardQty ? Array.from({ length: boardQty }, () => id) : [id],
          )
        : [];

    if (ids.length > line.qty) throw new Error(`Kit quantities disagree for ${line.name}.`);

    for (const id of ids) assign(1, [id], first.get(id));

    if (line.qty > ids.length) assign(line.qty - ids.length, [], undefined);

    return [...rows.values()];
  });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export const kitCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';

export const packingCsv = (rows: PackingRow[]) =>
  kitCsv([
    ['item', 'name', 'quantity', 'unit', 'module', 'step', 'guide_index', 'part_ids'],
    ...rows.map((row) => [
      row.key,
      row.name,
      row.qty,
      row.unit,
      row.module ?? 'unassigned',
      row.step,
      row.index,
      row.partIds.join(' '),
    ]),
  ]);
