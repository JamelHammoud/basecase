import { useState } from 'react';
import type { Case } from '../cases/schema';
import type { TryRecord } from '../cases/tries';
import { newDataset, type Dataset } from '../datasets/datasetFile';
import { saveDataset, useDatasets } from '../datasets/datasetStore';
import { errorMessage } from '../utils/errorMessage';
import { newId } from './helpers';
import type { ShowToast } from './types';

interface CaseDatasetOptions {
  active: Case | null;
  tries: TryRecord[];
  sceneId: string;
  showDataset: (id: string) => void;
  showToast: ShowToast;
}

export interface CaseDataset {
  canMake: boolean;
  make: () => void;
}

export function caseDatasetOf(kase: Case, tries: TryRecord[], sceneId: string, at = new Date().toISOString()) {
  return newDataset({
    id: newId('dataset'),
    name: kase.name,
    task: kase.brief.trim() || kase.name,
    sceneId,
    caseId: kase.id,
    members: tries.filter((t) => t.passed).map((t) => t.id),
    at,
  });
}

function sameMembers(a: string[], b: string[]) {
  const ids = new Set(b);

  return a.length === b.length && a.every((id) => ids.has(id));
}

export const caseDatasetIn = (datasets: Dataset[], kase: Case, members: string[]) =>
  datasets.find((d) => d.caseId === kase.id && !d.query && sameMembers(d.members, members)) ?? null;

export function useCaseDataset({ active, tries, sceneId, showDataset, showToast }: CaseDatasetOptions): CaseDataset {
  const datasets = useDatasets() ?? [];
  const [saving, setSaving] = useState(false);
  const canMake = !!active && !saving && tries.some((t) => t.passed);

  return {
    canMake,
    make: () => {
      if (!active || !canMake) return;

      const dataset = caseDatasetOf(active, tries, sceneId);
      const existing = caseDatasetIn(datasets, active, dataset.members);

      if (existing) return showDataset(existing.id);

      setSaving(true);
      saveDataset(dataset)
        .then(
          () => showDataset(dataset.id),
          (e: unknown) => showToast(errorMessage(e), { tone: 'error' }),
        )
        .finally(() => setSaving(false));
    },
  };
}
