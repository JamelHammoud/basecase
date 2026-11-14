import type { Case } from '../cases/schema';
import type { TryRecord } from '../cases/tries';
import { newDataset } from '../datasets/datasetFile';
import { saveDataset } from '../datasets/datasetStore';
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

export function useCaseDataset({ active, tries, sceneId, showDataset, showToast }: CaseDatasetOptions): CaseDataset {
  const canMake = !!active && tries.some((t) => t.passed);

  return {
    canMake,
    make: () => {
      if (!active || !canMake) return;

      const dataset = caseDatasetOf(active, tries, sceneId);

      saveDataset(dataset).then(
        () => showDataset(dataset.id),
        (e: unknown) => showToast(errorMessage(e), { tone: 'error' }),
      );
    },
  };
}
