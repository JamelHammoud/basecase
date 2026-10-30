import type { ScenePart } from '../types/robotics';

const MAX_SUGGESTIONS = 5;

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const row = [i];

    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }

    prev = row;
  }

  return prev[b.length];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function closeness(wanted: string, part: ScenePart): number {
  const query = wanted.toLowerCase();
  const id = part.id.toLowerCase();
  const shared = words(query).filter((w) => words(`${part.id} ${part.name}`).includes(w)).length;
  const contains = id.includes(query) || query.includes(id) ? 2 : 0;

  return editDistance(query, id) / Math.max(query.length, id.length, 1) - shared * 0.25 - contains * 0.25;
}

export function nearestIds(parts: ScenePart[], wanted: string, filter: (p: ScenePart) => boolean = () => true) {
  return parts
    .filter(filter)
    .map((p) => ({ id: p.id, score: closeness(wanted, p) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.id);
}

const isCad = (p: ScenePart) => p.kind === 'cad_part' && !!p.cad;

export function partCode(parts: ScenePart[], id: string) {
  const p = parts.find((x) => x.id === id);

  if (!p) {
    const near = nearestIds(parts, id, isCad);

    return { error: `No part with id ${id}.${near.length ? ` Closest CAD parts: ${near.join(', ')}.` : ''}` };
  }

  if (!p.cad) return { text: `${id} is a ${p.kind}, not a CAD part. Replace it with model_part.` };

  return { text: `${id} (${p.cad.language}):\n${p.cad.code}` };
}

export function partRecord(parts: ScenePart[], id: string) {
  const p = parts.find((x) => x.id === id);

  if (!p?.cad) return { exists: !!p };

  return { exists: true, volume: p.cad.volume ?? null, audit: p.cad.audit ?? null, expect: p.cad.expect ?? null };
}
