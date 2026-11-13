import type { ScenePart } from '../types/robotics';
import { booleanHash } from './hash';
import { isBooleanPart, withResult, type BooleanPart, type BooleanResult } from './parts';

export type ResultLookup = (hash: string) => BooleanResult | null | undefined;

function withInnerResults(part: BooleanPart, lookup: ResultLookup): BooleanPart {
  const operands = part.boolean.operands.map((o) => withResults(o, lookup));
  const same = operands.every((o, i) => o === part.boolean.operands[i]);

  return same ? part : { ...part, boolean: { ...part.boolean, operands } };
}

export function withResults(part: ScenePart, lookup: ResultLookup): ScenePart {
  if (!isBooleanPart(part)) return part;

  const inner = withInnerResults(part, lookup);
  const hash = booleanHash(inner);

  if (inner.boolean.hash === hash) return inner;

  const result = lookup(hash);

  return result === undefined ? inner : withResult(inner, hash, result);
}

export function partsWithResults(parts: ScenePart[], lookup: ResultLookup): ScenePart[] {
  const next = parts.map((p) => withResults(p, lookup));

  return next.every((p, i) => p === parts[i]) ? parts : next;
}

export function staleBooleans(parts: ScenePart[]): BooleanPart[] {
  return parts.flatMap((part) => {
    if (!isBooleanPart(part)) return [];

    const inner = staleBooleans(part.boolean.operands);

    return part.boolean.hash === booleanHash(part) ? inner : [...inner, part];
  });
}
