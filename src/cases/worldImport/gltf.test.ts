import { describe, expect, it } from 'vitest';
import { readWorldFiles } from '../worldImport';
import { gltfWorld } from './fixtures';

function fileSet(document: unknown, bin: Uint8Array) {
  return [
    { name: 'garage.gltf', bytes: new TextEncoder().encode(JSON.stringify(document)) },
    { name: 'floor.bin', bytes: bin },
  ];
}

describe('world geometry validation', () => {
  it('applies nested GLTF transforms before leveling in millimetres', async () => {
    const { document, bin } = gltfWorld();
    const nodes = [
      { translation: [1, 2, 3], children: [1] },
      { mesh: 0, scale: [2, 1, 1] },
    ];
    const world = await readWorldFiles(fileSet({ ...document, nodes }, bin));

    if (world.kind !== 'mesh') throw new Error('Mesh missing');

    expect(world.mesh.bounds).toEqual({ min: [-5000, 0, 1000], max: [7000, 0, 5000] });
    expect(world.transform.translation).toEqual([0, -2000, 0]);
    expect(world.mesh.normals.slice(0, 3)).toEqual(new Float32Array([0, 1, 0]));
  });

  it('refuses cyclic scene nodes and unsupported compressed primitives', async () => {
    const { document, bin } = gltfWorld();
    const cycle = { ...document, nodes: [{ mesh: 0, children: [0] }] };
    const compressed = {
      ...document,
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, extensions: { KHR_draco_mesh_compression: {} } }] }],
    };

    await expect(readWorldFiles(fileSet(cycle, bin))).rejects.toThrow(/scene nodes/);
    await expect(readWorldFiles(fileSet(compressed, bin))).rejects.toThrow(/uncompressed/);
  });

  it('triangulates a concave OBJ floor without filling its missing corner', async () => {
    const text = 'v 0 0 0\nv 0 0 3\nv 1 0 3\nv 1 0 1\nv 3 0 1\nv 3 0 0\nf 1 2 3 4 5 6';
    const world = await readWorldFiles([{ name: 'floor.obj', bytes: new TextEncoder().encode(text) }]);

    if (world.kind !== 'mesh') throw new Error('Mesh missing');

    const { positions, indices } = world.mesh;
    let area = 0;

    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map((index) => [
        positions[index * 3],
        positions[index * 3 + 2],
      ]);

      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }

    expect(area).toBe(5000000);
    expect(indices).toHaveLength(12);
  });
});
