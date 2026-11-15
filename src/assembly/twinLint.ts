import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { percent } from '../../electron/percent.mjs';

const TOLERANCE = 0.1;
const SIDE_SWAPS: Array<[RegExp, string]> = [
  [/(^|[-_])left([-_]|$)/, '$1right$2'],
  [/(^|[-_])Left(?=[-_A-Z]|$)/, '$1Right'],
  [/(^|[-_])LEFT(?=[-_]|$)/, '$1RIGHT'],
  [/^left(?=[A-Z])/, 'right'],
  [/([a-z0-9])Left(?=[-_A-Z]|$)/, '$1Right'],
  [/(^|[-_])l([-_]|$)/, '$1r$2'],
  [/(^|[-_])L([-_]|$)/, '$1R$2'],
  [/^l([a-z]{1,4})([-_])/, 'r$1$2'],
];

export function twinPairs(parts: ScenePart[]): Array<[ScenePart, ScenePart]> {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const pairs: Array<[ScenePart, ScenePart]> = [];

  for (const p of parts) {
    const twin = SIDE_SWAPS.map(([re, to]) => p.id.replace(re, to)).find((id) => id !== p.id && byId.has(id));

    if (twin) pairs.push([p, byId.get(twin)!]);
  }

  return pairs;
}

const differs = (a: number, b: number, floor = 0) =>
  Math.abs(a - b) > Math.max(floor, TOLERANCE * Math.max(Math.abs(a), Math.abs(b)));

const pct = (a: number, b: number) => percent((b - a) / Math.max(Math.abs(a), 1e-9));

const sizeOf = (m: MeshMeasure) => m.max.map((v, k) => v - m.min[k]);

interface TwinInputs {
  parts: ScenePart[];
  clashes: Array<{ a: string; b: string }>;
  measures: Record<string, MeshMeasure | undefined>;
}

function clashCounts(clashes: TwinInputs['clashes'], pairs: Array<[ScenePart, ScenePart]>) {
  const counts = new Map<string, number>();

  for (const [left, right] of pairs) {
    counts.set(left.id, 0);
    counts.set(right.id, 0);
  }

  for (const { a, b } of clashes) {
    const countA = counts.get(a);
    const countB = counts.get(b);

    if (countA !== undefined) counts.set(a, countA + 1);

    if (b !== a && countB !== undefined) counts.set(b, countB + 1);
  }

  return counts;
}

function pairDifferences([l, r]: [ScenePart, ScenePart], input: TwinInputs, counts: Map<string, number>): string[] {
  const out: string[] = [];
  const [cl, cr] = [counts.get(l.id) ?? 0, counts.get(r.id) ?? 0];
  const [ml, mr] = [input.measures[l.id], input.measures[r.id]];

  if (differs(cl, cr)) out.push(`clashes ${cl} vs ${cr}`);

  if (!ml || !mr) return out;

  if (differs(ml.volumeMm3, mr.volumeMm3)) out.push(`volume ${pct(ml.volumeMm3, mr.volumeMm3)}`);

  const [sl, sr] = [sizeOf(ml), sizeOf(mr)];
  const axes = [0, 1, 2].filter((k) => differs(sl[k], sr[k], 0.5));

  if (axes.length)
    out.push(`size ${axes.map((k) => `${'xzy'[k]} ${Math.round(sl[k])} vs ${Math.round(sr[k])} mm`).join(', ')}`);

  return out;
}

export function twinDifferences(input: TwinInputs): string[] {
  const solids = input.parts.filter((p) => p.kind !== 'hardware' && p.role === 'solid' && p.visible);
  const pairs = twinPairs(solids);

  if (!pairs.length) return [];

  const counts = clashCounts(input.clashes, pairs);

  return pairs.flatMap((pair) => {
    const diffs = pairDifferences(pair, input, counts);

    return diffs.length
      ? [
          `${pair[0].id} / ${pair[1].id} aren’t mirror twins: ${diffs.join(', ')}. Mirror the side that’s right onto the other, or fix the one that changed.`,
        ]
      : [];
  });
}
