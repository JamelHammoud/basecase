import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { localName } from '../cases/worldGltfFile';
import type { DroppedFile, MeshFormat } from '../cases/worldTypes';

export const NOWHERE = 'data:,';

const INLINE = /^(data|blob):/i;

const NEUTRAL = 0x9a9a9a;

const arrayBufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export interface DroppedUrls {
  resolve: (url: string) => string;
  revoke: () => void;
}

export function droppedUrls(files: DroppedFile[]): DroppedUrls {
  const made = new Map<string, string>();

  const urlOf = (file: DroppedFile) => {
    const known = made.get(file.name);

    if (known) return known;

    const url = URL.createObjectURL(new Blob([arrayBufferOf(file.bytes)]));

    made.set(file.name, url);

    return url;
  };

  return {
    resolve: (url) => {
      if (INLINE.test(url)) return url;

      const local = localName(url);
      const file = local === undefined ? undefined : files.find((f) => f.name === local);

      return file ? urlOf(file) : NOWHERE;
    },
    revoke: () => made.forEach((url) => URL.revokeObjectURL(url)),
  };
}

async function gltfScene(file: DroppedFile, files: DroppedFile[], binary: boolean): Promise<THREE.Object3D> {
  const urls = droppedUrls(files);
  const manager = new THREE.LoadingManager();

  manager.setURLModifier(urls.resolve);

  try {
    const data = binary ? arrayBufferOf(file.bytes) : new TextDecoder().decode(file.bytes);
    const gltf = await new GLTFLoader(manager).parseAsync(data, '');

    return gltf.scene;
  } finally {
    urls.revoke();
  }
}

function lookMaterial(colored: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colored ? 0xffffff : NEUTRAL,
    vertexColors: colored,
    roughness: 0.9,
    metalness: 0,
  });
}

function objScene(file: DroppedFile): THREE.Object3D {
  const root = new OBJLoader().parse(new TextDecoder().decode(file.bytes));

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) return;

    [mesh.material].flat().forEach((m) => m.dispose());
    mesh.material = lookMaterial(Boolean(mesh.geometry.getAttribute('color')));
  });

  return root;
}

export async function lookMeshScene(
  look: { file: string; format: MeshFormat },
  files: DroppedFile[],
): Promise<THREE.Object3D> {
  const file = files.find((f) => f.name === look.file);

  if (!file) throw new Error(`No ${look.file} among the world's files`);

  return look.format === 'obj' ? objScene(file) : gltfScene(file, files, look.format === 'glb');
}
