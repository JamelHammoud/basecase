import { useEffect, useState } from 'react';
import type { Dataset } from '../../datasets/datasetFile';
import { requirementChoices } from '../../vision/training/requirementChoices';
import type { TrainingRequirement } from '../../vision/training/requirementTypes';

export function useRequirementChoices(dataset: Dataset) {
  const [loaded, setLoaded] = useState<{
    dataset: Dataset;
    groups: TrainingRequirement['group'][];
    classes: string[];
  } | null>(null);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();

    const load = async () => {
      const choices = await requirementChoices(dataset, undefined, controller.signal);

      if (live) setLoaded({ dataset, ...choices });
    };

    void load().catch(() => {
      if (live) setLoaded({ dataset, groups: [], classes: [] });
    });

    return () => {
      live = false;
      controller.abort();
    };
  }, [dataset]);

  return loaded?.dataset === dataset ? loaded : null;
}
