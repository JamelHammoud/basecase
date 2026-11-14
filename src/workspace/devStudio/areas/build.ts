import { buildBom } from '../../../utils/bom';
import type { Studio } from '../types';

export default function buildStudio(studio: Studio) {
  return {
    guide: async () => {
      const made = await studio().core.guide.generate();

      return made && { html: made.html, pages: made.record.pages, steps: made.record.steps };
    },
    buildAlongSteps: () => studio().core.buildAlong.steps,
    bomLines: () => {
      const { partsRef, projectRef } = studio().core.docs;

      return buildBom({ parts: partsRef.current, project: projectRef.current, purchases: {}, measures: {} }).lines.map(
        ({ key, qty, category, lineUsd }) => ({ key, qty, category, lineUsd }),
      );
    },
  };
}
