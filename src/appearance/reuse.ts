import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { moveTextureOwnership } from './materialOwnership';
import { planarMaterial } from './render';
import type { Appearance } from './model';

export function onlyAppearanceChanged(a: ScenePart, b: ScenePart): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ScenePart>;

  return [...keys].every((key) => key === 'appearance' || a[key] === b[key]);
}

type DrawObject = THREE.Mesh | THREE.LineSegments;

const objects = (group: THREE.Group, lines: boolean) => {
  const result: DrawObject[] = [];

  group.traverse((object) => {
    if ((!lines && object instanceof THREE.Mesh) || (lines && object instanceof THREE.LineSegments))
      result.push(object);
  });

  return result;
};

const signature = (material: THREE.MeshStandardMaterial) =>
  JSON.stringify([
    material.customProgramCacheKey(),
    material.transparent,
    material.vertexColors,
    !!material.map,
    !!material.normalMap,
    !!material.roughnessMap,
    !!material.metalnessMap,
    material.normalMapType,
    material.alphaTest,
    material.side,
    material.flatShading,
  ]);

type PrepareTexture = (texture: THREE.Texture) => void;

function adopt(target: THREE.MeshStandardMaterial, source: THREE.MeshStandardMaterial, prepare: PrepareTexture): void {
  const previous = signature(target);

  for (const texture of new Set([source.map, source.normalMap, source.roughnessMap, source.metalnessMap])) {
    if (texture) prepare(texture);
  }

  moveTextureOwnership(source, target);
  target.copy(source);
  target.onBeforeCompile = source.onBeforeCompile;
  target.customProgramCacheKey = source.customProgramCacheKey;

  const appearance = source.userData.appearance as Appearance | undefined;

  if (appearance) planarMaterial(target, appearance);

  if (previous !== signature(target)) target.needsUpdate = true;
}

function swap(oldMesh: DrawObject, newMesh: DrawObject, prepare: PrepareTexture): void {
  const oldMaterials = Array.isArray(oldMesh.material) ? oldMesh.material : [oldMesh.material];
  const newMaterials = Array.isArray(newMesh.material) ? newMesh.material : [newMesh.material];

  if (oldMaterials.length !== newMaterials.length) return;

  for (let index = 0; index < oldMaterials.length; index++) {
    const previous = oldMaterials[index];
    const next = newMaterials[index];

    const standard = previous instanceof THREE.MeshStandardMaterial && next instanceof THREE.MeshStandardMaterial;
    const line = previous instanceof THREE.LineBasicMaterial && next instanceof THREE.LineBasicMaterial;

    if (!standard && !line) continue;

    if (standard) adopt(previous, next, prepare);

    if (line) previous.copy(next);

    oldMaterials[index] = next;
    newMaterials[index] = previous;
  }

  oldMesh.material = Array.isArray(oldMesh.material) ? oldMaterials : oldMaterials[0];
  newMesh.material = Array.isArray(newMesh.material) ? newMaterials : newMaterials[0];
}

export function reuseAppearanceMaterials(
  previous: THREE.Group,
  next: THREE.Group,
  prepare: PrepareTexture = () => {},
): void {
  if (previous.userData.placeholder !== next.userData.placeholder) return;

  for (const lines of [false, true]) {
    const before = objects(previous, lines);
    const after = objects(next, lines);

    if (before.length !== after.length) continue;

    before.forEach((mesh, index) => swap(mesh, after[index], prepare));
  }
}
