import * as THREE from 'three';
import { BATCHED_LAYER } from './partBatches';
import { canvasNdc, type Stage } from './stage';

export function partMeshes(stage: Stage): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  stage.partsRoot.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });

  return meshes;
}

export function partRaycaster(): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();

  raycaster.layers.enable(BATCHED_LAYER);

  return raycaster;
}

export function rayAt(stage: Stage, clientX: number, clientY: number): THREE.Raycaster {
  const raycaster = partRaycaster();

  raycaster.setFromCamera(canvasNdc(stage, clientX, clientY), stage.camera);

  return raycaster;
}

export function raycastParts(stage: Stage, clientX: number, clientY: number): THREE.Intersection | null {
  return rayAt(stage, clientX, clientY).intersectObjects(partMeshes(stage), false)[0] ?? null;
}

export function floorPoint(raycaster: THREE.Raycaster): THREE.Vector3 | null {
  const point = new THREE.Vector3();

  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point) ? point : null;
}

export const hitPartId = (hit: THREE.Intersection | null) =>
  (hit?.object.userData.partId as string | undefined) ?? null;
