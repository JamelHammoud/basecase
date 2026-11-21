import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { build } from 'rolldown';
import { fixtureBundle } from './fixtureBundle.mjs';

it.each([
  ['fixtures.ts', 'acceptanceFixtures'],
  ['routeFixtures.ts', 'routingFixtures'],
])('bundles and imports the real %s dependency graph in Node', async (entry, exported) => {
  await fs.mkdir('scratch/electrical', { recursive: true });

  const temporary = await fs.mkdtemp(path.resolve('scratch/electrical/bundle-test-'));
  const file = path.join(temporary, 'fixtures.mjs');

  try {
    const result = await build({
      ...fixtureBundle(`./${entry}`),
      output: { file, format: 'esm', codeSplitting: false },
    });

    expect(result.output.find((entry) => entry.type === 'chunk')?.exports).toContain(exported);

    const fixture = await import(pathToFileURL(file).href);
    const source = await fs.readFile(file, 'utf8');

    expect(fixture[exported]).toBeTypeOf('function');
    expect(source).not.toContain('?url');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
