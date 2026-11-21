import type { IdealTendon } from '../types/tendon';

export function remappedTendon(
  tendon: IdealTendon | undefined,
  jointId: (id: string) => string,
): { tendon?: IdealTendon } {
  if (!tendon) return {};

  return {
    tendon: {
      ...tendon,
      spool: { ...tendon.spool },
      law: { ...tendon.law },
      terms: tendon.terms.map((term) => ({ ...term, joint: jointId(term.joint) })),
    },
  };
}
