import type { Studio } from '../types';

export default function cradleStudio(studio: Studio) {
  return {
    assemblyCradleState: () => ({
      step: studio().core.buildAlong.index,
      metrics: studio().core.cradle.prepared?.metrics ?? null,
    }),
    assemblyRobotWeight: async () =>
      (await studio().core.readiness.checkNow())?.rows.find((row) => row.check === 'Weight')?.detail ?? null,
  };
}
