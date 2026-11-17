import { expect, it } from 'vitest';
import { selectedBrowserTools } from './browserTools.mjs';

it('prepares the router on exactly one real browser shard and leaves unrelated shards without native tools', async () => {
  const selections = [];

  for (let index = 1; index <= 6; index++) selections.push(await selectedBrowserTools(`${index}/6`));

  expect(selections.filter(({ routing }) => routing)).toHaveLength(1);
  expect(selections.filter(({ native }) => native).length).toBeGreaterThanOrEqual(1);
  expect(selections.filter(({ native }) => native).length).toBeLessThanOrEqual(3);
  expect(selections.every(({ native, routing }) => !routing || native)).toBe(true);
});
