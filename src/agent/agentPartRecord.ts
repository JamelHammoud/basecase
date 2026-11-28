import type { ScenePart } from '../types/robotics';
import { editDistance } from '../../electron/editDistance.mjs';

const MAX_SUGGESTIONS = 5;

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function closeness(query: string, terms: string[], part: ScenePart): number {
  const id = part.id.toLowerCase();
  const candidateTerms = terms.length ? words(`${part.id} ${part.name}`) : [];
  let shared = 0;

  for (const term of terms) {
    if (candidateTerms.includes(term)) shared++;
  }

  const contains = id.includes(query) || query.includes(id) ? 2 : 0;

  return editDistance(query, id) / Math.max(query.length, id.length, 1) - shared * 0.25 - contains * 0.25;
}

export function nearestIds(parts: ScenePart[], wanted: string, filter: (p: ScenePart) => boolean = () => true) {
  const query = wanted.toLowerCase();
  const terms = words(query);

  return parts
    .filter(filter)
    .map((p) => ({ id: p.id, score: closeness(query, terms, p) }))
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

export function partSource(parts: ScenePart[], id: string) {
  const cad = parts.find((p) => p.id === id)?.cad;

  return cad ? { language: cad.language, code: cad.code, expect: cad.expect ?? null } : { language: null };
}
