import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPrinted } from '../utils/bom';
import { meshPartsFromFile } from './meshImport';
import * as THREE from 'three';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { OBJ_MODEL, OBJ_MATERIALS, glbModel, fbxModel } from '../utils/modelMesh.fixtures';

afterEach(() => vi.unstubAllGlobals());

let nextId = 0;

const newId = (prefix: string) => `${prefix}-${++nextId}`;

function boxStl([x, y, z]: [number, number, number]): string {
  const corners = [
    [0, 0, 0],
    [x, 0, 0],
    [x, y, 0],
    [0, y, 0],
    [0, 0, z],
    [x, 0, z],
    [x, y, z],
    [0, y, z],
  ];
  const faces = [
    [0, 2, 1, 0, 3, 2],
    [4, 5, 6, 4, 6, 7],
    [0, 1, 5, 0, 5, 4],
    [3, 7, 6, 3, 6, 2],
    [0, 4, 7, 0, 7, 3],
    [1, 2, 6, 1, 6, 5],
  ];
  const facets = faces.flatMap((f) => [f.slice(0, 3), f.slice(3)]);
  const body = facets
    .map(
      (t) =>
        `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${corners[i].join(' ')}`).join('\n')}\nendloop\nendfacet`,
    )
    .join('\n');

  return `solid box\n${body}\nendsolid box\n`;
}

describe('mesh import', () => {
  it('turns a Z-up STL into a printable part standing on the drop point', async () => {
    const file = new File([boxStl([10, 20, 30])], 'bracket.stl');
    const [part] = await meshPartsFromFile({ file, newId, at: [50, 0, -20] });

    expect(part.name).toBe('bracket');
    expect(part.dimensions).toEqual({ width: 10, height: 30, depth: 20 });
    expect(part.position).toEqual([50, 15, -20]);
    expect(part.mesh?.indices).toHaveLength(36);
    expect(isPrinted(part)).toBe(true);
  });

  it('reads a model drawn in metres at real size', async () => {
    const file = new File([boxStl([0.04, 0.02, 0.01])], 'tiny.stl');
    const [part] = await meshPartsFromFile({ file, newId });

    expect(part.dimensions).toEqual({ width: 40, height: 10, depth: 20 });
  });
});

describe('model import structure', () => {
  it.each(['obj', 'fbx', 'glb'])('preserves %s objects, material colors and their relative positions', async (ext) => {
    const contents = { obj: OBJ_MODEL, fbx: fbxModel(), glb: glbModel() };
    const file = new File([contents[ext as keyof typeof contents]], `assembly.${ext}`);
    const resources = [new File([OBJ_MATERIALS], 'colors.mtl')];
    const parts = await meshPartsFromFile({ file, newId, resources, at: [50, 20, -10] });

    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.name)).toEqual(['Left', 'Right']);
    expect(parts.map((p) => p.color)).toEqual(['#ff0000', '#00ff00']);
    expect(parts.map((p) => p.position)).toEqual([
      [35, 25, -10],
      [65, 25, -10],
    ]);
    expect(parts[0].group).toEqual(parts[1].group);
    expect(parts[0].group?.name).toBe('assembly');
    expect(new Set(parts.map((p) => p.id)).size).toBe(2);
    expect(parts.every(isPrinted)).toBe(true);
    expect(parts.every((p) => p.mesh?.indices.length === 3)).toBe(true);
  });

  it.each(['obj', 'glb'])('keeps more than 200,000 triangles from a local %s', async (ext) => {
    const triangles = 200001;
    const contents =
      ext === 'obj' ? `v 0 0 0\nv 10 0 0\nv 0 10 10\n${'f 1 2 3\n'.repeat(triangles)}` : glbModel(triangles);
    const parts = await meshPartsFromFile({ file: new File([contents], `detailed.${ext}`), newId });

    expect(parts.reduce((sum, p) => sum + p.mesh!.indices.length / 3, 0)).toBe(triangles * (ext === 'glb' ? 2 : 1));
  });

  it('retains source material settings in the rendered part', async () => {
    vi.stubGlobal('ProgressEvent', Event);

    const bytes = glbModel();
    const length = new DataView(bytes.buffer).getUint32(12, true);
    const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));

    document.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(bytes.slice(28 + length)).toString('base64')}`;
    document.materials[0] = {
      name: 'Glass',
      pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 0.4], roughnessFactor: 0.2, metallicFactor: 0.7 },
      alphaMode: 'BLEND',
      doubleSided: true,
    };

    const [part] = await meshPartsFromFile({ file: new File([JSON.stringify(document)], 'glass.gltf'), newId });
    const group = buildPartGroup(part, false);
    const mesh = group.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;

    expect(material).toMatchObject({
      name: 'Glass',
      roughness: 0.2,
      metalness: 0.7,
      opacity: 0.4,
      transparent: true,
      side: THREE.DoubleSide,
    });
    releasePartGroup(group);
  });

  it('retains OBJ vertex colors through welding and rendered creased geometry', async () => {
    const file = new File(['v 0 0 0 1 0 0\nv 10 0 0 0 1 0\nv 0 10 10 0 0 1\nf 1 2 3'], 'colors.obj');
    const [part] = await meshPartsFromFile({ file, newId });
    const group = buildPartGroup(part, false);
    const mesh = group.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;

    expect(part.mesh?.colors).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(mesh.geometry.getAttribute('color').array)).toEqual(part.mesh?.colors);
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    releasePartGroup(group);
  });

  it('keeps small pieces at the complete model scale without rounding their dimensions', async () => {
    const contents =
      'o Large\nv 0 0 0\nv 10 0 0\nv 0 10 10\nf 1 2 3\no Small\nv 20.001 0 0\nv 20.0012 0 0\nv 20.001 0.0002 0.0002\nf 4 5 6';
    const parts = await meshPartsFromFile({ file: new File([contents], 'precision.obj'), newId });
    const small = parts[1];

    expect(small.dimensions.width).toBeCloseTo(0.0002, 5);
    expect(small.dimensions.height).toBeCloseTo(0.0002, 7);
    expect(small.dimensions).toEqual({
      width: small.mesh!.baseSize[0],
      height: small.mesh!.baseSize[1],
      depth: small.mesh!.baseSize[2],
    });
    expect(small.position[0] - parts[0].position[0]).toBeCloseTo(15.0011, 4);
  });

  it('rejects an empty model without adding an empty part', async () => {
    await expect(meshPartsFromFile({ file: new File(['o empty'], 'empty.obj'), newId })).rejects.toThrow(
      'No triangles found',
    );
  });
});
