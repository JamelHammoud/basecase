import { useState } from 'react';

interface Shown {
  focus: string | null;
  query: string;
}

export function useTriesMode() {
  const [shown, setShown] = useState<Shown | null>(null);

  return {
    open: !!shown,
    focus: shown?.focus ?? null,
    query: shown?.query ?? '',
    show: (focus: string | null, query = '') => setShown({ focus, query }),
    close: () => setShown(null),
  };
}

export type TriesMode = ReturnType<typeof useTriesMode>;
