import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Vec3 = [number, number, number];

export interface ComponentPieceArrays {
  position: Float32Array;
  normal: Float32Array;
  color: string;
  metalness: number;
  roughness: number;
}

export interface ComponentArrays {
  pieces: ComponentPieceArrays[];
  edges: Float32Array;
  size: Vec3;
}

function finish(color: THREE.Color): { metalness: number; roughness: number } {
  const hsl = { h: 0, s: 0, l: 0 };

  color.getHSL(hsl, THREE.SRGBColorSpace);

  const gold = hsl.h > 0.08 && hsl.h < 0.17 && hsl.s > 0.35 && hsl.l > 0.35;
  const silver = hsl.s < 0.12 && hsl.l > 0.55 && hsl.l < 0.85;

  if (gold || silver) return { metalness: 0.75, roughness: 0.32 };

  return { metalness: 0.05, roughness: 0.55 };
}

function creasedPieces(scene: THREE.Object3D) {
  const pieces: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }> = [];

  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;

    if (!mesh.isMesh) return;

    const plain = new THREE.BufferGeometry();

    plain.setAttribute('position', mesh.geometry.getAttribute('position').clone());

    if (mesh.geometry.index) plain.setIndex(mesh.geometry.index.clone());

    plain.applyMatrix4(mesh.matrixWorld);
    pieces.push({
      geometry: toCreasedNormals(plain, THREE.MathUtils.degToRad(30)),
      color: (mesh.material as THREE.MeshStandardMaterial).color,
    });
  });

  return pieces;
}

function mergedEdges(geometries: THREE.BufferGeometry[]): Float32Array {
  const parts = geometries.map((g) => new THREE.EdgesGeometry(g, 35));
  const merged = parts.length ? mergeGeometries(parts, false) : null;

  return merged ? (merged.getAttribute('position').array as Float32Array) : new Float32Array();
}

export async function componentArrays(data: ArrayBuffer): Promise<ComponentArrays> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const pieces = creasedPieces(gltf.scene);
  const box = new THREE.Box3();

  pieces.forEach(({ geometry }) => {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  });

  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());

  return {
    pieces: pieces.map(({ geometry, color }) => ({
      position: geometry.getAttribute('position').array as Float32Array,
      normal: geometry.getAttribute('normal').array as Float32Array,
      color: '#' + color.getHexString(THREE.SRGBColorSpace),
      ...finish(color),
    })),
    edges: mergedEdges(pieces.map((p) => p.geometry)),
    size: size.toArray(),
  };
}

export const componentTransfers = (arrays: ComponentArrays): Transferable[] => [
  arrays.edges.buffer,
  ...arrays.pieces.flatMap((p) => [p.position.buffer, p.normal.buffer]),
];
