import { useState } from 'react';
import { MAX_CASE_NAME } from '../cases/caseBuilder';
import type { ProjectSettings } from '../types/robotics';
import type { Setter } from './types';

export function useCaseNames(setProject: Setter<ProjectSettings>) {
  const [renaming, setRenaming] = useState<string | null>(null);

  const finish = (id: string, name: string | null) => {
    setRenaming(null);

    if (!name) return;

    setProject((p) => ({
      ...p,
      cases: (p.cases ?? []).map((c) => (c.id === id ? { ...c, name: name.slice(0, MAX_CASE_NAME) } : c)),
    }));
  };

  return { renaming, start: setRenaming, finish };
}

export type CaseNames = ReturnType<typeof useCaseNames>;
