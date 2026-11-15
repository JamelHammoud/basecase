import type { Studio } from '../types';

export default function frameLabelsStudio(studio: Studio) {
  return {
    frameLabels: () => {
      const labels = studio().core.frameLabels;

      return { set: labels.editing?.set ?? null, busy: labels.loading || !!labels.running, problem: labels.problem };
    },
  };
}
