import type { RuleCode } from '../readiness/wording';

export interface ReportLine {
  rank: number;
  text: string;
  ids: string[];
  code: RuleCode;
}

export function listIds(ids: string[], shown = 4): string {
  if (ids.length <= shown) return joinAnd(ids);

  return `${ids.slice(0, shown).join(', ')} and ${ids.length - shown} more`;
}

export function joinAnd(ids: string[]): string {
  if (ids.length < 2) return ids.join('');

  return `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

export function grouped(
  entries: Array<{ key: string; id: string; rank: number; code: RuleCode }>,
  render: (key: string, ids: string[]) => string,
): ReportLine[] {
  const groups = new Map<string, { ids: string[]; rank: number; code: RuleCode }>();

  for (const e of entries) {
    const g = groups.get(e.key) ?? { ids: [], rank: e.rank, code: e.code };

    g.ids.push(e.id);
    groups.set(e.key, g);
  }

  return [...groups].map(([key, g]) => ({ rank: g.rank, text: render(key, g.ids), ids: g.ids, code: g.code }));
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const mm = (v: number) => `${Math.round(v * 10) / 10} mm`;
