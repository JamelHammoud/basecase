import { expect, it } from 'vitest';
import { build } from 'rolldown';
import { fixtureBundle } from './fixtureBundle.mjs';

it.each([
  ['./fixtures.ts', 'acceptanceFixtures'],
  ['./routeFixtures.ts', 'routingFixtures'],
])('bundles the real electrical entry %s for Node without Vite asset loading', async (input, exported) => {
  const result = await build({
    ...fixtureBundle(input),
    write: false,
    output: { format: 'esm', codeSplitting: false },
  });

  expect(result.output.find((entry) => entry.type === 'chunk')?.exports).toContain(exported);
});
