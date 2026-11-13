import type { ScenePart } from '../types/robotics';
import { syncFrames } from './frames';
import { isBooleanPart, operandIdsDeep, operandsOf, type BooleanPart } from './parts';

const flatOperands = (part: ScenePart): ScenePart[] => operandsOf(part).flatMap((o) => [o, ...flatOperands(o)]);

export function surfaceOperands(parts: ScenePart[]): ScenePart[] {
  const operands = parts.flatMap(flatOperands);

  return operands.length ? [...parts, ...operands] : parts;
}

const dissolved = (operands: ScenePart[]) => operands.map((o) => ({ ...o }));

function rebuild(part: ScenePart, edited: Map<string, ScenePart>): ScenePart[] {
  if (!isBooleanPart(part)) return [part];

  const original = part.boolean.operands;

  if (!original.some((o) => edited.has(o.id))) return [part];

  const kept = original.filter((o) => edited.has(o.id)).flatMap((o) => rebuild(edited.get(o.id)!, edited));

  if (!edited.has(original[0].id) || kept.length < 2) return dissolved(kept);

  return [withOperands(part, kept)];
}

function withOperands(part: BooleanPart, operands: ScenePart[]): ScenePart {
  const same =
    operands.length === part.boolean.operands.length && operands.every((o, i) => o === part.boolean.operands[i]);

  return same ? part : { ...part, boolean: { ...part.boolean, operands } };
}

export function settleOperands(before: ScenePart[], after: ScenePart[]): ScenePart[] {
  const operandIds = new Set(operandIdsDeep(before));

  if (operandIds.size === 0) return after.some(isBooleanPart) ? after.map(syncFrames) : after;

  const edited = new Map(after.filter((p) => operandIds.has(p.id)).map((p) => [p.id, p]));
  const top = after.filter((p) => !operandIds.has(p.id));

  return top.flatMap((p) => rebuild(p, edited)).map(syncFrames);
}

export function editWithOperands(parts: ScenePart[], updater: (parts: ScenePart[]) => ScenePart[]): ScenePart[] {
  return settleOperands(parts, updater(surfaceOperands(parts)));
}
