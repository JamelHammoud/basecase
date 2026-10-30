import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Bed } from '../../print/bed';

const BED_COLOR = 0x262626;
const GRID_COLOR = 0x333333;
const EDGE_COLOR = 0x4a4a4a;
const KEEP_OUT_COLOR = 0xef4444;

export function plateToScene(bed: Bed): THREE.Matrix4 {
  const toThree = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

  return toThree.multiply(new THREE.Matrix4().makeTranslation(-bed.origin[0], -bed.origin[1], 0));
}

function gridLines(bed: Bed): THREE.LineSegments {
  const points: number[] = [];

  for (let x = 10; x < bed.width; x += 10) points.push(x, 0.05, 0, x, 0.05, -bed.depth);

  for (let y = 10; y < bed.depth; y += 10) points.push(0, 0.05, -y, bed.width, 0.05, -y);

  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: GRID_COLOR }));
}

function outline(w: number, d: number, y: number, color: number): THREE.LineLoop {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    [
      [0, 0],
      [w, 0],
      [w, -d],
      [0, -d],
    ].map(([x, z]) => new THREE.Vector3(x, y, z)),
  );

  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color }));
}

function keepOutMesh(k: Bed['keepOut'][number]): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(k.w, k.d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: KEEP_OUT_COLOR, transparent: true, opacity: 0.18, depthWrite: false }),
  );

  mesh.position.set(k.x + k.w / 2, 0.1, -(k.y + k.d / 2));

  return mesh;
}

function volumeBox(bed: Bed): THREE.LineSegments {
  const box = new THREE.BoxGeometry(bed.width, bed.height, bed.depth).translate(
    bed.width / 2,
    bed.height / 2,
    -bed.depth / 2,
  );

  return new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 }),
  );
}

export function buildBed(bed: Bed): THREE.Group {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(bed.width, bed.depth).rotateX(-Math.PI / 2).translate(bed.width / 2, 0, -bed.depth / 2),
    new THREE.MeshStandardMaterial({ color: BED_COLOR, roughness: 0.9, metalness: 0 }),
  );

  plate.receiveShadow = true;
  plate.name = 'bed';
  group.add(plate, gridLines(bed), outline(bed.width, bed.depth, 0.06, EDGE_COLOR), volumeBox(bed));

  for (const k of bed.keepOut) group.add(keepOutMesh(k));

  return group;
}

export function disposeTree(object: THREE.Object3D): void {
  object.traverse((o) => {
    const drawable = o as THREE.Mesh;

    drawable.geometry?.dispose();

    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];

    for (const m of materials) m?.dispose();
  });
}

export function lightScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);

  key.position.set(200, 400, 250);
  scene.environment = env;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 1.1), key);

  return () => {
    env.dispose();
    pmrem.dispose();
  };
}
