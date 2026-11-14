import { buildBom } from '../../../utils/bom';
import { TIME_CHECK } from '../../../utils/engineeringTime';
import type { Studio } from '../types';

export default function buildStudio(studio: Studio) {
  return {
    guide: async () => {
      const made = await studio().core.guide.generate();

      return made && { html: made.html, pages: made.record.pages, steps: made.record.steps };
    },
    buildAlongSteps: () => studio().core.buildAlong.steps,
    timeCheck: () => {
      const row = studio().core.readiness.current?.rows.find((r) => r.check === TIME_CHECK);

      return row && { status: row.status, detail: row.detail };
    },
    bomLines: () => {
      const { partsRef, projectRef } = studio().core.docs;

      return buildBom({ parts: partsRef.current, project: projectRef.current, purchases: {}, measures: {} }).lines.map(
        ({ key, qty, category, lineUsd }) => ({ key, qty, category, lineUsd }),
      );
    },
  };
}
