import * as THREE from 'three';
import type { GeometryPayload, Instance, ShapeSpec } from './analysisOps';

export interface SceneShapes {
  instances: Instance[];
  shapes: Map<string, ShapeSpec>;
  geometries: Map<string, THREE.BufferGeometry>;
}

const UNIT = new THREE.Vector3(1, 1, 1);
const round = (v: number) => Math.round(v * 1e4) / 1e4;

function geometryId(g: THREE.BufferGeometry) {
  const attr = g.attributes.position;
  const version = attr instanceof THREE.InterleavedBufferAttribute ? attr.data.version : attr.version;

  return `${g.uuid}@${version}`;
}

function rigidFrame(object: THREE.Object3D) {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();

  object.matrixWorld.decompose(t, q, new THREE.Vector3());

  return new THREE.Matrix4().compose(t, q, UNIT);
}

function meshesOf(object: THREE.Object3D, frameInverse: THREE.Matrix4) {
  const meshes: Array<{ geometry: THREE.BufferGeometry; matrix: number[] }> = [];

  object.traverse((o) => {
    const mesh = o as THREE.Mesh;

    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes?.position) return;

    meshes.push({
      geometry: mesh.geometry,
      matrix: frameInverse.clone().multiply(mesh.matrixWorld).toArray().map(round),
    });
  });

  return meshes;
}

export function snapshotShapes(objects: Array<{ id: string; object: THREE.Object3D }>): SceneShapes {
  const instances: Instance[] = [];
  const shapes = new Map<string, ShapeSpec>();
  const geometries = new Map<string, THREE.BufferGeometry>();

  for (const { id, object } of objects) {
    object.updateWorldMatrix(true, true);

    const frame = rigidFrame(object);
    const meshes = meshesOf(object, frame.clone().invert());

    if (!meshes.length) continue;

    const ids = meshes.map((m) => geometryId(m.geometry));
    const key = meshes.map((m, i) => `${ids[i]}:${m.matrix.join(',')}`).join(';');

    meshes.forEach((m, i) => geometries.set(ids[i], m.geometry));
    shapes.set(key, { key, meshes: meshes.map((m, i) => ({ geometry: ids[i], matrix: m.matrix })) });
    instances.push({ id, key, matrix: frame.toArray() });
  }

  return { instances, shapes, geometries };
}

export function plainVec3(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  if (!('isInterleavedBufferAttribute' in attr) && attr.array instanceof Float32Array && attr.itemSize === 3) {
    return attr.array.slice(0, attr.count * 3);
  }

  const out = new Float32Array(attr.count * 3);

  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }

  return out;
}

export function geometryPayload(id: string, geometry: THREE.BufferGeometry): GeometryPayload {
  const index = geometry.index;

  return {
    id,
    positions: plainVec3(geometry.attributes.position),
    index: index ? new Uint32Array(index.array as Uint16Array | Uint32Array) : null,
  };
}
