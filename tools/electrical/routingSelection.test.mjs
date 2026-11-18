import { expect, it } from 'vitest';
import { needsRouting } from './routingSelection.mjs';

it('selects routing and fabrication inputs while leaving unrelated wiring and product changes alone', () => {
  for (const file of [
    'src/wiring/boardPcb.ts',
    'electron/electrical/validate.mjs',
    'tools/electrical/routeFixtures.ts',
    'src/workspace/useBoardRouting.ts',
    'e2e/boardRouting.e2e.test.ts',
    '.github/workflows/electrical.yml',
    'package-lock.json',
  ])
    expect(needsRouting([file], 'pull_request')).toBe(true);

  for (const file of [
    'src/wiring/routeCollision.ts',
    'src/wiring/cableStock.ts',
    'src/components/PartDetails.tsx',
    'docs/guide/build.md',
  ])
    expect(needsRouting([file], 'pull_request')).toBe(false);

  expect(needsRouting([], 'schedule')).toBe(true);
});
