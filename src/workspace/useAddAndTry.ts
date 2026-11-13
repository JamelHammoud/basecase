import { useEffect, useEffectEvent, useState } from 'react';
import type { Case } from '../cases/schema';
import type { CaseTry } from './useCaseTry';

interface AddAndTry {
  add: (kase: Case) => Case;
  active: Case | null;
  attempt: CaseTry;
}

export function useAddAndTry({ add, active, attempt }: AddAndTry) {
  const [pending, setPending] = useState<string | null>(null);
  const due = pending !== null && active?.id === pending && attempt.phase === 'idle';
  const run = useEffectEvent(() => {
    setPending(null);
    void attempt.reference();
  });

  useEffect(() => {
    if (!due) return;

    const soon = setTimeout(run, 0);

    return () => clearTimeout(soon);
  }, [due]);

  return (kase: Case) => {
    const named = add(kase);

    setPending(named.id);

    return named;
  };
}
