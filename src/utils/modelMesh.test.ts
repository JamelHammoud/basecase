import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadModelMesh, modelPieces } from './modelMesh';
import { meshoptModel } from './modelCompressed.fixtures';
import { glbModel } from './modelMesh.fixtures';

afterEach(() => vi.unstubAllGlobals());

const triangle = () =>
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));

describe('model mesh extraction', () => {
  it('keeps a mirrored face outward and applies ancestor transforms', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(triangle());

    root.position.set(10, 20, 30);
    mesh.scale.x = -1;
    root.add(mesh);

    const [piece] = modelPieces(root);

    expect(Array.from(piece.positions)).toEqual([10, 20, 30, 10, 21, 30, 9, 20, 30]);
  });

  it('bakes the loaded skin pose into the imported geometry', () => {
    const geometry = triangle();
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(geometry);

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    bone.position.y = 5;

    expect(Array.from(modelPieces(mesh)[0].positions)).toEqual([0, 5, 0, 1, 5, 0, 0, 6, 0]);
  });

  it('preserves morph targets at their loaded weights', () => {
    const geometry = triangle();

    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2, 0, 0, 2], 3)];

    const mesh = new THREE.Mesh(geometry);

    mesh.morphTargetInfluences![0] = 0.5;
    expect(Array.from(modelPieces(mesh)[0].positions)).toEqual([0, 0, 1, 1, 0, 1, 0, 1, 1]);
  });

  it('decodes required Meshopt compression', async () => {
    const data = await meshoptModel();
    const pieces = await loadModelMesh({ data: data.buffer, path: 'compressed.glb' });

    expect(pieces).toHaveLength(2);
    expect(pieces[0].positions).toHaveLength(9);
  });

  it('uses local companion buffers and refuses an omitted or remote glTF buffer before fetching it', async () => {
    vi.stubGlobal('ProgressEvent', Event);

    const bytes = glbModel();
    const view = new DataView(bytes.buffer);
    const length = view.getUint32(12, true);
    const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
    const data = bytes.slice(28 + length).buffer;

    document.buffers[0].uri = 'assembly.bin';

    const file = new TextEncoder().encode(JSON.stringify(document)).buffer;
    const pieces = await loadModelMesh({
      data: file,
      path: 'assembly.gltf',
      resources: [{ name: 'assembly.bin', data }],
    });

    expect(pieces).toHaveLength(2);
    await expect(loadModelMesh({ data: file, path: 'assembly.gltf' })).rejects.toThrow('Include assembly.bin');

    document.buffers[0].uri = 'https://example.com/private.bin';

    const fetch = vi.spyOn(globalThis, 'fetch');

    await expect(
      loadModelMesh({ data: new TextEncoder().encode(JSON.stringify(document)).buffer, path: 'assembly.gltf' }),
    ).rejects.toThrow('Include');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
