import * as THREE from 'three';
import { whenIdle } from '../../utils/whenIdle';
import { cadEdgeMaterial, createMaterial } from '../partMesh/materials';
import { batchedMaterialFrom } from './batchKey';
import type { Stage } from './stage';

interface CompiledProgram {
  getUniforms: () => unknown;
}

function warmBatch(geometry: THREE.BufferGeometry): THREE.BatchedMesh {
  const material = batchedMaterialFrom(createMaterial({ color: '#e4e4e7', role: 'solid', selected: false }));
  const batch = new THREE.BatchedMesh(1, geometry.getAttribute('position').count, geometry.index?.count, material);

  batch.setColorAt(batch.addInstance(batch.addGeometry(geometry)), new THREE.Color('#e4e4e7'));
  batch.castShadow = true;
  batch.receiveShadow = true;

  return batch;
}

function warmGroup(): THREE.Group {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geometry);
  const group = new THREE.Group();

  for (const role of ['solid', 'cutout'] as const) {
    const mesh = new THREE.Mesh(geometry, createMaterial({ color: '#e4e4e7', role, selected: false }));

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  group.add(new THREE.LineSegments(edges, cadEdgeMaterial('solid', false)), warmBatch(geometry));

  return group;
}

function materialsOf(...roots: THREE.Object3D[]): THREE.Material[] {
  const found = new Set<THREE.Material>();

  for (const root of roots) {
    root.traverse((object) => {
      const material = (object as THREE.Mesh).material;

      [material ?? []].flat().forEach((m) => found.add(m));
    });
  }

  return [...found];
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    const drawable = object as THREE.Mesh;

    if (object instanceof THREE.BatchedMesh) object.dispose();

    drawable.geometry?.dispose();
    (drawable.material as THREE.Material | undefined)?.dispose();
  });
}

function renderShadowPass(stage: Stage, group: THREE.Group): void {
  const { renderer, scene, camera, orbit } = stage;
  const target = new THREE.WebGLRenderTarget(1, 1);
  const previous = renderer.getRenderTarget();

  group.position.copy(orbit.target);
  scene.add(group);
  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous);
  scene.remove(group);
  target.dispose();
}

interface Finish {
  materials: THREE.Material[];
  group: THREE.Group;
  onDone: () => void;
}

function finishPrograms(stage: Stage, { materials, group, onDone }: Finish): () => void {
  const { renderer } = stage;
  let cancel = () => {};
  const next = (index: number) => {
    if (index === materials.length) {
      cancel = whenIdle(() => {
        renderShadowPass(stage, group);
        onDone();
      });

      return;
    }

    cancel = whenIdle(() => {
      const program = renderer.properties.get(materials[index]) as { currentProgram?: CompiledProgram };

      program.currentProgram?.getUniforms();
      next(index + 1);
    });
  };

  next(0);

  return () => cancel();
}

export function warmShaders(stage: Stage, onDone: () => void): () => void {
  const { renderer, scene, camera } = stage;
  const group = warmGroup();
  let stopFinishing = () => {};
  let disposed = false;

  void Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(group, camera, scene)])
    .then(() => {
      if (!disposed) stopFinishing = finishPrograms(stage, { materials: materialsOf(scene, group), group, onDone });
    })
    .catch(() => {});

  return () => {
    disposed = true;
    stopFinishing();
    disposeGroup(group);
  };
}
