import { useEffect, useState } from 'react';
import { requestConditionComparison, type ConditionComparison } from '../../vision/training/conditionRequest';
import type { ImageGroup } from '../../vision/training/conditionEvaluation';
import type { VisionInspectionReports } from './useVisionInspection';

export type { ConditionComparison };

export function useConditionComparison(reports: VisionInspectionReports, group: ImageGroup | null) {
  const [loaded, setLoaded] = useState<{
    reports: VisionInspectionReports;
    key: string;
    result?: ConditionComparison;
    problem?: string;
  } | null>(null);
  const key = JSON.stringify(group);

  useEffect(() => {
    if (!group) return;

    return requestConditionComparison({ ...reports, group }, (completion) => {
      setLoaded({ reports, key, ...completion });
    });
  }, [reports, group, key]);

  return loaded?.reports === reports && loaded.key === key ? loaded : null;
}
