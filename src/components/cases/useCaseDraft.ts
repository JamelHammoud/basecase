import { useEffect, useState } from 'react';
import type { BuiltCase, CaseSpec } from '../../cases/caseBuilder';
import type { CaseBuilder } from '../../workspace/useCaseBuilder';
import { errorMessage } from '../../utils/errorMessage';

const PENDING: BuiltCase = { ok: false, problem: '' };

interface Prepared {
  builder: CaseBuilder;
  spec: CaseSpec;
  draft: BuiltCase;
}

export function useCaseDraft(builder: CaseBuilder, spec: CaseSpec): BuiltCase {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const { fixture, goal, world, values } = spec;

  useEffect(() => {
    if (!fixture) return;

    let current = true;
    const source = { fixture, goal, world, values };

    void builder
      .prepare(source)
      .then((draft) => {
        if (current) setPrepared({ builder, spec: source, draft });
      })
      .catch((error: unknown) => {
        if (current) setPrepared({ builder, spec: source, draft: { ok: false, problem: errorMessage(error) } });
      });

    return () => {
      current = false;
    };
  }, [builder, fixture, goal, world, values]);

  if (!fixture) return builder.preview(spec);

  const matches =
    prepared?.builder === builder &&
    prepared.spec.fixture === fixture &&
    prepared.spec.goal === goal &&
    prepared.spec.world === world &&
    prepared.spec.values === values;

  return matches ? prepared!.draft : PENDING;
}
