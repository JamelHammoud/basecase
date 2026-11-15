import { expect, it, vi } from 'vitest';
import { readWorldFiles } from './worldImport';
import { kitchenCollider, kitchenSplat } from './worldImportFixture';

vi.mock('../sim/inputSources', () => {
  throw new Error('World parsing must not initialize drive input sources');
});

it('parses captured worlds without loading camera inference or speech input runtimes', async () => {
  const world = await readWorldFiles([kitchenCollider(), kitchenSplat(1024)]);

  expect(world.kind).toBe('mesh');

  if (world.kind !== 'mesh') throw new Error('Expected the kitchen mesh');

  expect(world.mesh.indices.length).toBeGreaterThan(0);
  expect(world.splat?.count).toBe(1024);
});
