import { afterAll, describe, expect, it } from 'vitest';
import { renderPart, stopKernels } from '../cad-kernel/client.mjs';
import { GUIDE_EXAMPLES } from './examples.mjs';

afterAll(() => stopKernels());

describe('guide examples', () => {
  const cases = Object.entries(GUIDE_EXAMPLES).flatMap(([language, codes]) =>
    codes.map((code, i) => [`${language} ${i + 1}`, language, code]),
  );

  it.each(cases)(
    '%s compiles to one clean body',
    async (_name, language, code) => {
      const res = await renderPart(language, code);

      expect(res.error ?? null).toBeNull();
      expect(res.stats.volume).toBeGreaterThan(100);
      expect(res.audit.bodies).toBe(1);
      expect(res.audit.nonManifoldEdges).toBe(0);
    },
    60000,
  );
});
