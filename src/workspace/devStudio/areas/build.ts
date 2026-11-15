import { buildBom } from '../../../utils/bom';
import type { Studio } from '../types';
import { currentWiring } from '../../../readiness/currentWiring';

export default function buildStudio(studio: Studio) {
  return {
    buildTime: () => {
      const row = studio().core.readiness.current?.rows.find((r) => r.check === 'Time');

      return row ? { hours: row.hours, status: row.status } : null;
    },
    guide: async () => {
      const made = await studio().core.guide.generate();

      return made && { html: made.html, pages: made.record.pages, steps: made.record.steps };
    },
    buildAlongSteps: () => studio().core.buildAlong.steps,
    buildAlongRoutes: () => studio().core.buildAlong.step?.routes ?? [],
    bomLines: () => {
      const { docs, readiness } = studio().core;
      const { partsRef, projectRef } = docs;

      return buildBom({
        parts: partsRef.current,
        project: projectRef.current,
        purchases: {},
        measures: {},
        wiring: currentWiring(readiness),
      }).lines.map(({ key, qty, category, lineUsd }) => ({ key, qty, category, lineUsd }));
    },
  };
}
