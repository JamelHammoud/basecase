import type { ScenePart } from '../../types/robotics';
import { supportFingerprint, validSupport, type SupportFailure } from './support';

export function supportFailureParts(parts: ScenePart[], cause: SupportFailure) {
  const byId = new Map(parts.map((p) => [p.id, p]));

  return parts
    .filter((p) => p.sketch?.support !== undefined)
    .map((part) => {
      const record = part.sketch!;
      const support = record.support;
      const source = validSupport(support) ? byId.get(support.partId) : undefined;

      return {
        ...part,
        sketch: {
          ...record,
          support: { ...support!, issue: cause, attempt: source ? supportFingerprint(source) : '' },
        },
      };
    });
}
