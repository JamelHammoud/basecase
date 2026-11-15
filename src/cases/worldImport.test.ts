import { describe, expect, it, vi } from 'vitest';
import { readWorldFiles, worldUnitScale } from './worldImport';
import { glbFile, gltfFiles, objWorld } from './worldImport/fixtures';
import { fixtureRoom } from './roomFixture';

describe('world file import', () => {
  it('keeps metre and millimetre kitchens at true size with vertex colors and stairs', async () => {
    const metres = await readWorldFiles([objWorld()]);
    const millimetres = await readWorldFiles([objWorld('kitchen.obj', 1000)]);

    expect(metres.kind).toBe('mesh');
    expect(millimetres).toMatchObject({ kind: 'mesh', transform: { scale: 1 } });

    if (metres.kind !== 'mesh' || millimetres.kind !== 'mesh') throw new Error('Mesh missing');

    expect(Array.from(metres.mesh.positions)).toEqual(Array.from(millimetres.mesh.positions));
    expect(Math.max(...metres.mesh.positions)).toBe(3000);
    expect(metres.mesh.positions[13]).toBe(200);
    expect(metres.mesh.colors?.[0]).toBeCloseTo(0.03310477, 6);
    expect(metres.mesh.colors?.[1]).toBeCloseTo(0.13286832, 6);
    expect(metres.mesh.colors?.[2]).toBeCloseTo(0.31854678, 6);
    expect(metres.mesh.materials[0].color).toEqual([1, 1, 1, 1]);
    expect(metres.mesh.indices).toHaveLength(12);
  });

  it('levels the largest floor while keeping raised geometry above it', async () => {
    const world = await readWorldFiles([objWorld('slope.obj', 1, 0.2)]);

    if (world.kind !== 'mesh') throw new Error('Mesh missing');

    expect([1, 4, 7, 10].map((i) => world.mesh.positions[i])).toEqual([0, 0, 0, 0]);
    expect(world.mesh.positions[13]).toBeCloseTo(200, 3);
    expect(world.transform.quaternion[0]).toBeCloseTo(-Math.sin(0.1), 5);
  });

  it('keeps the largest plane normal when a smaller plane has another slope', async () => {
    const fixture = objWorld();
    const text = new TextDecoder().decode(fixture.bytes) + '\nv 0 1 0\nv 0 1 1\nv 1 2 0\nf 9 10 11';
    const world = await readWorldFiles([{ name: fixture.name, bytes: new TextEncoder().encode(text) }]);

    if (world.kind !== 'mesh') throw new Error('Mesh missing');

    expect(world.transform.quaternion).toEqual([0, 0, 0, 1]);
    expect([1, 4, 7, 10].map((i) => world.mesh.positions[i])).toEqual([0, 0, 0, 0]);
  });

  it('reads dropped glTF resources and GLB without fetching and preserves material colors', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));

    try {
      const gltf = await readWorldFiles(gltfFiles());
      const glb = await readWorldFiles([glbFile()]);

      expect(gltf).toMatchObject({
        kind: 'mesh',
        name: 'garage',
        mesh: { materials: expect.arrayContaining([expect.objectContaining({ color: [0.2, 0.4, 0.6, 1] })]) },
      });
      expect(glb.kind === 'mesh' && glb.mesh.positions).toEqual(gltf.kind === 'mesh' && gltf.mesh.positions);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it.each([
    'https://example.com/floor.bin',
    'file:///floor.bin',
    '../floor.bin',
    '%2e%2e/floor.bin',
    '//example.com/floor.bin',
  ])('refuses resource URI %s before network access', async (uri) => {
    await expect(readWorldFiles(gltfFiles({ uri }))).rejects.toThrow();
  });

  it('refuses nonfinite coordinates, oversized accessors and triangle counts', async () => {
    await expect(readWorldFiles(gltfFiles({ nan: true }))).rejects.toThrow(/finite/);
    await expect(readWorldFiles(gltfFiles({ count: 900000000 }))).rejects.toThrow();

    const mesh = objWorld();
    const text = new TextDecoder().decode(mesh.bytes) + '\n' + 'f 1 2 3\n'.repeat(200001);

    await expect(readWorldFiles([{ name: mesh.name, bytes: new TextEncoder().encode(text) }])).rejects.toThrow(
      /triangle/,
    );
  });

  it('rejects conflicting meshes, missing colliders and oversized dropped bytes', async () => {
    await expect(readWorldFiles([objWorld(), objWorld('garage.obj')])).rejects.toThrow();
    await expect(readWorldFiles([{ name: 'capture.ply', bytes: new Uint8Array() }])).rejects.toThrow();
    await expect(
      readWorldFiles([{ name: 'kitchen.obj', bytes: new Uint8Array(64 * 1024 * 1024 + 1) }]),
    ).rejects.toThrow();
  });

  it('keeps RoomPlan on its existing reader', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(fixtureRoom()));
    const result = await readWorldFiles([{ name: 'living-room.json', bytes }]);

    expect(result).toMatchObject({ kind: 'room', room: { name: 'living-room' } });
  });

  it('keeps RoomPlan filename punctuation and its 8 MB byte cap', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(fixtureRoom()));
    const result = await readWorldFiles([{ name: 'Kitchen: morning?.json', bytes }]);

    expect(result).toMatchObject({ kind: 'room', room: { name: 'Kitchen: morning?' } });
    await expect(
      readWorldFiles([{ name: 'Kitchen: morning?.json', bytes: new Uint8Array(8 * 1024 * 1024 + 1) }]),
    ).rejects.toThrow(/8 MB/);
  });

  it('uses a fixed extent rule with explicit unit overrides', () => {
    expect(worldUnitScale(999)).toBe(1000);
    expect(worldUnitScale(1000)).toBe(1);
    expect(worldUnitScale(6000, 'm')).toBe(1000);
    expect(worldUnitScale(6, 'mm')).toBe(1);
  });
});
