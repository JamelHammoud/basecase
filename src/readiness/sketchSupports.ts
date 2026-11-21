import type { ScenePart } from '../types/robotics';
import { ambiguousSupportIds, sketchSupportParts, supportCause } from '../utils/sketch/supportState';
import { validSupport, supportFingerprint } from '../utils/sketch/support';
import { withinSupportBudget } from '../utils/sketch/supportBudget';
import { jsonHash } from '../utils/geometryHash';
import type { SupportFailure } from '../utils/sketch/support';
import { ruleFinding } from './wording';

export const SKETCH_SUPPORT_CAUSES: Record<SupportFailure | 'pending', string> = {
  malformed: 'The saved face reference can’t be read.',
  transform: 'The support has an unsupported transform.',
  missing: 'The supporting part was removed.',
  ambiguous: 'The supporting face is missing or has competing surfaces.',
  topology: 'The supporting face is no longer one rectangle.',
  solve: 'The sketch constraints can’t be solved on this face.',
  profile: 'The sketch no longer forms a solid.',
  cycle: 'The sketch supports form a cycle.',
  limit: 'The sketch support exceeds the regeneration limits.',
  upstream: 'An earlier sketch support needs resolution.',
  pending: 'The sketch is waiting for its supporting face to regenerate.',
};

export function sketchSupportFindings(parts: ScenePart[]) {
  const flat = sketchSupportParts(parts);
  const ambiguous = ambiguousSupportIds(flat);
  const byId = new Map(flat.map((p) => [p.id, p]));

  return flat.flatMap((p) => {
    const cause = supportCause(p, byId, new Set(), ambiguous);

    if (!cause) return [];

    const text = `${p.name}: ${SKETCH_SUPPORT_CAUSES[cause]}`;

    return [ruleFinding('sketch-support', 'blocker', { text, agentText: text, ids: [p.id], subject: p.id })];
  });
}

export function supportedSketchEvidence(parts: ScenePart[]) {
  const flat = sketchSupportParts(parts);
  const bound = flat.filter((p) => p.sketch?.support !== undefined);

  if (!bound.length) return '';

  if (!withinSupportBudget(bound.map((p) => p.sketch))) return 'sketch-limit';

  const byId = new Map(flat.map((p) => [p.id, p]));
  const ambiguous = ambiguousSupportIds(flat);

  return bound
    .map((p) => {
      const support = p.sketch!.support;
      const source = validSupport(support) ? byId.get(support.partId) : undefined;

      return `${p.id}:${jsonHash(p.sketch)}:${source ? supportFingerprint(source) : ''}:${supportCause(p, byId, new Set(), ambiguous) ?? ''}`;
    })
    .sort()
    .join('|');
}
