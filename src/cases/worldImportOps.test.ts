import { describe, expect, it } from 'vitest';
import { worldImportHandlers } from './worldImportOps';
import { hashWorldAsset } from './worldAssets';

describe('world worker import pipeline', () => {
  it('prepares portable floor collision and hashes its rendered mesh inside the worker operation', async () => {
    const bytes = new TextEncoder().encode(
      'v -1000 0 -1000\nv 1000 0 -1000\nv 1000 0 1000\nv -1000 0 1000\nf 1 3 2\nf 1 4 3\n',
    );
    const { result, transfer } = await worldImportHandlers.importWorld({
      files: [{ name: 'floor.obj', bytes }],
      options: { units: 'mm' },
    });

    expect(result.kind).toBe('mesh');

    if (result.kind !== 'mesh') throw new Error('Expected imported mesh');

    expect(result.pieces.length).toBeGreaterThan(0);
    expect(result.world.mesh.indices).toHaveLength(6);
    expect(result.hash).toEqual(await hashWorldAsset({ world: result.world, pieces: result.pieces }));
    expect(JSON.parse(result.serializedJson)).toHaveProperty('pieces');
    expect(transfer).toContain(result.world.mesh.positions.buffer);
    expect(transfer).toContain(result.pieces[0].positions.buffer);
    expect(new Set(transfer).size).toEqual(transfer?.length);
  });
});
