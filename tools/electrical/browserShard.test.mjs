import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { browserShard } from './browserShard.mjs';

it('assigns every browser file and each native dependency to exactly one of the six CI shards', async () => {
  const inventory = (await readdir('e2e')).filter((file) => file.endsWith('.e2e.test.ts'));
  const files = inventory.map((file) => path.join('e2e', file));
  const shards = await Promise.all(Array.from({ length: 6 }, (_, index) => browserShard(files, `${index + 1}/6`)));
  const assigned = shards.flat();

  expect(assigned).toHaveLength(files.length);
  expect(new Set(assigned)).toEqual(new Set(files.map((file) => path.resolve(file).replaceAll('\\', '/'))));
  expect(
    Math.max(...shards.map((files) => files.length)) - Math.min(...shards.map((files) => files.length)),
  ).toBeLessThanOrEqual(1);

  for (const file of ['boardRouting.e2e.test.ts', 'kitElectrical.e2e.test.ts']) {
    expect(shards.filter((files) => files.some((assigned) => path.basename(assigned) === file))).toHaveLength(1);
  }
});
