import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

function daeScene(text: string): THREE.Object3D | null {
  const dae = new ColladaLoader().parse(text, '');

  if (!dae) return null;

  if (/<up_axis>\s*Z_UP/i.test(text)) dae.scene.rotation.set(0, 0, 0);
  else if (/<up_axis>\s*Y_UP/i.test(text)) dae.scene.rotation.set(Math.PI / 2, 0, 0);

  return dae.scene;
}

export async function loadMesh(data: ArrayBuffer, path: string): Promise<THREE.BufferGeometry | null> {
  const ext = path.split('.').pop()!.toLowerCase();

  if (ext === 'stl') {
    const g = new STLLoader().parse(data);
    const out = new THREE.BufferGeometry();

    out.setAttribute('position', g.getAttribute('position'));

    return out;
  }

  if (ext === 'obj') return collect(new OBJLoader().parse(new TextDecoder().decode(data)));

  if (ext === 'dae') {
    const scene = daeScene(new TextDecoder().decode(data));

    return scene ? collect(scene) : null;
  }

  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new GLTFLoader().parseAsync(data, '');

    return collect(gltf.scene);
  }

  return null;
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
    default:
      return null;
  }

  return geo.index ? geo.toNonIndexed() : geo;
}
