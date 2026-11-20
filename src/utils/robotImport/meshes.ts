import * as THREE from 'three';
import { MeshoptDecoder } from 'meshoptimizer';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Geometry } from './model';

function collect(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);

  const geos: THREE.BufferGeometry[] = [];

  root.traverse((o) => {
    const m = o as THREE.Mesh;

    if (!m.isMesh || !m.geometry) return;

    const g = new THREE.BufferGeometry();

    g.setAttribute('position', m.geometry.getAttribute('position').clone());

    if (m.geometry.index) g.setIndex(m.geometry.index.clone());

    g.applyMatrix4(m.matrixWorld);
    geos.push(g.index ? g.toNonIndexed() : g);
  });

  return geos.length ? mergeGeometries(geos, false) : null;
}

function daeScene(text: string, options: MeshSceneOptions): THREE.Object3D | null {
  const dae = new ColladaLoader(options.manager).parse(text, '');

  if (!dae) return null;

  if (options.sceneAxes) return dae.scene;

  if (/<up_axis>\s*Z_UP/i.test(text)) dae.scene.rotation.set(0, 0, 0);
  else if (/<up_axis>\s*Y_UP/i.test(text)) dae.scene.rotation.set(Math.PI / 2, 0, 0);

  return dae.scene;
}

class NoTextures extends THREE.Loader<THREE.Texture> {
  load(_url: string, onLoad?: (texture: THREE.Texture) => void) {
    const texture = new THREE.Texture();

    queueMicrotask(() => onLoad?.(texture));

    return texture;
  }
}

export function texturelessManager() {
  const manager = new THREE.LoadingManager();

  manager.addHandler(/./, new NoTextures());

  return manager;
}

function fbxScene(data: ArrayBuffer, manager = texturelessManager()): THREE.Object3D {
  const root = new FBXLoader(manager).parse(data, '');
  const unit = Number(root.userData.unitScaleFactor);

  if (Number.isFinite(unit) && unit > 0) root.scale.multiplyScalar(unit);

  return root;
}

function positionsOnly(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;

  return new THREE.BufferGeometry().setAttribute('position', flat.getAttribute('position'));
}

interface MeshSceneOptions {
  manager?: THREE.LoadingManager;
  sceneAxes?: boolean;
}

async function gltfScene(data: ArrayBuffer, options: MeshSceneOptions) {
  const dracoModule = options.sceneAxes ? await import('../../earth/draco') : null;
  const draco = dracoModule?.dracoLoader();
  const loader = new GLTFLoader(options.manager).setMeshoptDecoder(MeshoptDecoder);

  if (draco) loader.setDRACOLoader(draco);

  try {
    return (await loader.parseAsync(data, '')).scene;
  } finally {
    draco?.dispose();
  }
}

export async function loadMeshScene(
  data: ArrayBuffer,
  path: string,
  options: MeshSceneOptions = {},
): Promise<THREE.Object3D | null> {
  const ext = path.split('.').pop()!.toLowerCase();
  const manager = options.manager;

  if (ext === 'stl') return new THREE.Mesh(new STLLoader().parse(data));

  if (ext === 'obj') return new OBJLoader().parse(new TextDecoder().decode(data));

  if (ext === 'dae') return daeScene(new TextDecoder().decode(data), options);

  if (ext === 'fbx') return fbxScene(data, manager);

  if (ext === '3mf') return new ThreeMFLoader(manager).parse(data);

  if (ext === 'ply') {
    const geometry = new PLYLoader().parse(data);

    return new THREE.Mesh(options.sceneAxes ? geometry : positionsOnly(geometry));
  }

  if (ext === 'glb' || ext === 'gltf') return gltfScene(data, options);

  return null;
}

export async function loadMesh(data: ArrayBuffer, path: string): Promise<THREE.BufferGeometry | null> {
  const scene = await loadMeshScene(data, path);

  return scene ? collect(scene) : null;
}

function hullGeometry(points: number[]): THREE.BufferGeometry | null {
  const vectors = Array.from({ length: Math.floor(points.length / 3) }, (_, i) =>
    new THREE.Vector3().fromArray(points, i * 3),
  );

  if (vectors.length < 4) return null;

  try {
    return new ConvexGeometry(vectors);
  } catch {
    return null;
  }
}

export function primitive(g: Geometry): THREE.BufferGeometry | null {
  let geo: THREE.BufferGeometry;

  switch (g.type) {
    case 'box':
      geo = new THREE.BoxGeometry(g.size.x, g.size.y, g.size.z);

      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(g.radius, 24, 16);

      break;
    case 'ellipsoid':
      geo = new THREE.SphereGeometry(1, 24, 16);
      geo.scale(g.radii.x, g.radii.y, g.radii.z);

      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(g.radius, g.radius, g.length, 32);
      geo.rotateX(Math.PI / 2);

      break;
    case 'capsule':
      geo = new THREE.CapsuleGeometry(g.radius, g.length, 6, 24);
      geo.rotateX(Math.PI / 2);

      break;
    case 'hull':
      return hullGeometry(g.points);
    default:
      return null;
  }

  return geo.index ? geo.toNonIndexed() : geo;
}
