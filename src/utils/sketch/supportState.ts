import { isSupportVerified } from './supportVerified';
import type { PartSketch } from './types';
import type { ScenePart } from '../../types/robotics';
import { supportRecordProblem } from './supportValidation';
import { operandsOf } from '../../booleans/parts';
import {
  SUPPORT_LIMITS,
  supportFingerprint,
  validSupport,
  validSupportTransform,
  type SupportFailure,
} from './support';

export function sketchSupportParts(parts: ScenePart[]): ScenePart[] {
  const result: ScenePart[] = [];
  const pending = parts.map((part) => ({ part, depth: 0 }));

  while (pending.length) {
    const { part, depth } = pending.pop()!;

    result.push(part);

    if (depth >= SUPPORT_LIMITS.depth) continue;

    for (const child of operandsOf(part)) pending.push({ part: child, depth: depth + 1 });
  }

  return result;
}

function currentCause(record: PartSketch, source: ScenePart): SupportFailure | 'pending' | null {
  const support = record.support!;
  const current = supportFingerprint(source);

  if (current === 'limit') return 'limit';

  if (support.issue && support.attempt === current) return support.issue;

  return support.fingerprint === current && isSupportVerified(record, current) ? null : 'pending';
}

export function supportCause(
  part: ScenePart,
  byId: ReadonlyMap<string, ScenePart>,
  seen = new Set<string>(),
  ambiguous: ReadonlySet<string> = new Set(),
): SupportFailure | 'pending' | null {
  const support = part.sketch?.support;

  if (support === undefined) return null;

  const problem = supportRecordProblem(part.sketch);

  if (problem || !validSupport(support)) return problem ?? 'malformed';

  if (seen.has(part.id)) return 'cycle';

  if (seen.size >= SUPPORT_LIMITS.depth) return 'limit';

  if (ambiguous.has(part.id) || ambiguous.has(support.partId)) return 'malformed';

  const source = byId.get(support.partId);

  if (!source) return 'missing';

  if (!validSupportTransform(source)) return 'transform';

  seen.add(part.id);

  if (supportCause(source, byId, seen, ambiguous)) return 'upstream';

  return currentCause(part.sketch!, source);
}

export function ambiguousSupportIds(parts: ScenePart[]) {
  const seen = new Set<string>();
  const ambiguous = new Set<string>();

  for (const part of parts) {
    if (seen.has(part.id)) ambiguous.add(part.id);

    seen.add(part.id);
  }

  return ambiguous;
}

export function supportWork(parts: ScenePart[]) {
  const flat = sketchSupportParts(parts);
  const byId = new Map(flat.map((p) => [p.id, p]));
  const ambiguous = ambiguousSupportIds(flat);
  const bound = flat.filter((p) => p.sketch?.support !== undefined);
  const pending = bound.filter((p) => {
    const support = p.sketch!.support;
    const cause = supportCause(p, byId, new Set(), ambiguous);

    if (!cause) return false;

    const source = validSupport(support) ? byId.get(support.partId) : undefined;
    const attempt = source ? supportFingerprint(source) : '';

    return !support?.issue || support.attempt !== attempt;
  });

  return { flat, byId, bound, pending };
}

export function patchSupportParts(parts: ScenePart[], patches: ReadonlyMap<string, ScenePart>): ScenePart[] {
  const patch = (part: ScenePart): ScenePart => {
    const next = patches.get(part.id) ?? part;
    const children = operandsOf(next);

    if (!children.length || !next.boolean) return next;

    const operands = patchSupportParts(children, patches);

    return operands === children ? next : { ...next, boolean: { ...next.boolean, operands } };
  };
  const result = parts.map(patch);

  return result.every((p, i) => p === parts[i]) ? parts : result;
}
