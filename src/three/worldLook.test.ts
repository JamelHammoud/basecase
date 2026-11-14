import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DroppedFile, StoredWorld, WorldLook } from '../cases/worldTypes';
import { buildWorldLook, placeLook, WORLD_LOOK } from './worldLook';
import { droppedUrls, NOWHERE } from './worldLookMesh';

const text = (name: string, body: string): DroppedFile => ({ name, bytes: new TextEncoder().encode(body) });

const world = (files: DroppedFile[], look: WorldLook): StoredWorld => ({
  hash: 'w1',
  name: 'Room',
  pieces: [],
  bounds: { min: [0, 0], max: [1, 1] },
  files,
  look,
  frame: { mmPerUnit: 1000, liftMm: 50 },
});

const COLORED_OBJ = ['v 0 0 0 1 0 0', 'v 1 0 0 0 1 0', 'v 0 1 0 0 0 1', 'f 1 2 3'].join('\n');
const PLAIN_OBJ = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

function triangleGltf(bufferUri: string) {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin: DroppedFile = { name: 'room.bin', bytes: new Uint8Array(positions.buffer) };
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    buffers: [{ uri: bufferUri, byteLength: 36 }],
  };

  return [text('room.gltf', JSON.stringify(json)), bin];
}

const meshesOf = (root: THREE.Object3D) => {
  const meshes: THREE.Mesh[] = [];

  root.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));

  return meshes;
};

beforeAll(() => {
  if (!('ProgressEvent' in globalThis)) vi.stubGlobal('ProgressEvent', class extends Event {});
});

afterEach(() => vi.restoreAllMocks());

describe('world look', () => {
  it('shows an OBJ with its vertex colours, at true size on the Case placement', async () => {
    const look = await buildWorldLook(
      world([text('room.obj', COLORED_OBJ)], { mesh: { file: 'room.obj', format: 'obj' } }),
    );

    placeLook(look.object, { mmPerUnit: 1000, liftMm: 50 }, [10, 0, 20]);

    const [mesh] = meshesOf(look.object);
    const material = mesh.material as THREE.MeshStandardMaterial;

    expect(look.object.name).toBe(WORLD_LOOK);
    expect(look.object.userData.look).toBe('mesh');
    expect(material.vertexColors).toBe(true);
    expect(new THREE.Vector3(1, 1, 0).applyMatrix4(mesh.matrixWorld).toArray()).toEqual([1010, 1050, 20]);

    placeLook(look.object, { mmPerUnit: 1000, liftMm: 50, flip: true }, [10, 0, 20]);

    const flipped = new THREE.Vector3(1, 1, 1).applyMatrix4(mesh.matrixWorld).toArray();

    expect(flipped.map(Math.round)).toEqual([1010, -950, -980]);
    look.dispose();
  });

  it('gives an OBJ without colours a neutral grey', async () => {
    const look = await buildWorldLook(
      world([text('room.obj', PLAIN_OBJ)], { mesh: { file: 'room.obj', format: 'obj' } }),
    );
    const material = meshesOf(look.object)[0].material as THREE.MeshStandardMaterial;

    expect(material.vertexColors).toBe(false);
    expect(material.color.r).toBeCloseTo(material.color.g);
    look.dispose();
  });

  it('reads a glTF’s buffer from the dropped files', async () => {
    const files = triangleGltf('room.bin');
    const look = await buildWorldLook(world(files, { mesh: { file: 'room.gltf', format: 'gltf' } }));

    expect(meshesOf(look.object)[0].geometry.getAttribute('position').count).toBe(3);
    look.dispose();
  });

  it('fetches nothing a glTF names outside the drop', async () => {
    const fetched: string[] = [];
    const realFetch = globalThis.fetch;

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      fetched.push(input instanceof Request ? input.url : String(input));

      return realFetch(input, init);
    });

    const files = triangleGltf('https://example.com/room.bin');

    await expect(buildWorldLook(world(files, { mesh: { file: 'room.gltf', format: 'gltf' } }))).rejects.toThrow();
    expect(fetched).toEqual([NOWHERE]);
  });

  it('maps only dropped names, and sends anything else nowhere', () => {
    const urls = droppedUrls([text('a.png', 'x')]);

    expect(urls.resolve('a.png')).toMatch(/^blob:/);
    expect(urls.resolve('a.png')).toBe(urls.resolve('a%2Epng'));
    expect(urls.resolve('../a.png')).toBe(NOWHERE);
    expect(urls.resolve('file:///etc/passwd')).toBe(NOWHERE);
    expect(urls.resolve('https://example.com/a.png')).toBe(NOWHERE);
    expect(urls.resolve('data:,hi')).toBe('data:,hi');
    urls.revoke();
  });
});
