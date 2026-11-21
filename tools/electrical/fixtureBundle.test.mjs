import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { buildElectricalFixtures } from './fixtureBundle.mjs';

it.each([
  ['fixtures.ts', 'acceptanceFixtures'],
  ['routeFixtures.ts', 'routingFixtures'],
])('bundles and imports the real %s dependency graph in Node', async (entry, exported) => {
  await fs.mkdir('scratch/electrical', { recursive: true });

  const temporary = await fs.mkdtemp(path.resolve('scratch/electrical/bundle-test-'));
  const file = path.join(temporary, 'fixtures.mjs');

  try {
    await buildElectricalFixtures({ input: `tools/electrical/${entry}`, file });

    const fixture = await import(pathToFileURL(file).href);
    const source = await fs.readFile(file, 'utf8');

    expect(fixture[exported]).toBeTypeOf('function');
    expect(source).not.toContain('?url');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
