import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';

const TOLERANCE = 0.1;
const SIDE_SWAPS: Array<[RegExp, string]> = [
  [/(^|[-_])left([-_]|$)/, '$1right$2'],
  [/(^|[-_])l([-_]|$)/, '$1r$2'],
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

const pct = (a: number, b: number) => `${Math.round(((b - a) / Math.max(Math.abs(a), 1e-9)) * 100)}%`;

const sizeOf = (m: MeshMeasure) => m.max.map((v, k) => v - m.min[k]);

interface TwinInputs {
  parts: ScenePart[];
  clashes: Array<{ a: string; b: string }>;
  measures: Record<string, MeshMeasure | undefined>;
}

function clashCount(clashes: TwinInputs['clashes'], id: string) {
  return clashes.filter((c) => c.a === id || c.b === id).length;
}

function pairDifferences([l, r]: [ScenePart, ScenePart], input: TwinInputs): string[] {
  const out: string[] = [];
  const [cl, cr] = [clashCount(input.clashes, l.id), clashCount(input.clashes, r.id)];
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
  const solids = input.parts.filter((p) => p.kind !== 'hardware' && p.role === 'solid');

  return twinPairs(solids).flatMap((pair) => {
    const diffs = pairDifferences(pair, input);

    return diffs.length
      ? [
          `${pair[0].id} / ${pair[1].id} aren't mirror twins: ${diffs.join(', ')}. Mirror the side that's right onto the other, or fix the one that changed.`,
        ]
      : [];
  });
}
