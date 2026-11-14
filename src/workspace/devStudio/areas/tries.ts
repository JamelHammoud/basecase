import { loadStoredTry } from '../../../cases/tryStore';
import type { Studio } from '../types';

export default function triesStudio(studio: Studio) {
  const timeline = () => studio().core.simTraining.cases.timeline;

  return {
    trySegments: () => {
      const { segments, record } = timeline();

      return {
        id: segments.tryId ?? record?.id ?? null,
        loaded: segments.tryId !== null,
        selected: segments.selected,
        segments: segments.segments.map(({ start, end, label }) => ({ start, end, label })),
      };
    },
    tryLabels: async (id: string) => (await loadStoredTry(id))?.labels ?? null,
  };
}
