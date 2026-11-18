import { expect, it } from 'vitest';
import { needsRouting } from './routingSelection.mjs';

it('selects routing and fabrication inputs while leaving unrelated wiring and product changes alone', () => {
  for (const file of [
    'src/wiring/boardPcb.ts',
    'src/wiring/electricalPinMaps.ts',
    'src/wiring/electricalModules.ts',
    'src/data/components.ts',
    'src/data/connectorPorts.ts',
    'src/data/componentPorts.ts',
    'src/data/supplies.ts',
    'src/data/sourcedItems.ts',
    'src/utils/engineeringPower.ts',
    'src/utils/powerSources.ts',
    'src/utils/servoAmps.ts',
    'electron/electrical/validate.mjs',
    'tools/electrical/routeFixtures.ts',
    'tools/electrical/fabricationFacts.mjs',
    'tools/electrical/fixtures.ts',
    'tools/electrical/check.mjs',
    'tools/electrical/boardCheck.mjs',
    'src/workspace/useBoardRouting.ts',
    'src/workspace/useRoutedBoard.ts',
    'src/workspace/useBoard.ts',
    'src/workspace/useBoardPreview.ts',
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
