import { loadManifests } from '../../../cases/tryStore';
import type { Studio } from '../types';

export default function tryLabelsStudio(studio: Studio) {
  const timeline = () => studio().core.simTraining.cases.timeline;

  return {
    tryLabels: () => {
      const { record, labels } = timeline();

      return {
        id: record?.id ?? null,
        segments: labels.segments,
        flags: labels.flags,
        tags: labels.stored?.labels?.tags ?? [],
        outcome: labels.stored?.outcome ?? null,
      };
    },
    storedTry: async (id: string) => (await loadManifests([id]))[0] ?? null,
  };
}
