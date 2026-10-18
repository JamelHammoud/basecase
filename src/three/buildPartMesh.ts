import * as THREE from 'three';
import type { ScenePart, SculptMeshData } from '../types/robotics';
import { partBuilders } from './partMesh/builders';
import { createContext, type BuildOptions } from './partMesh/context';
import { sculptedPart } from './partMesh/customModel';
import { convertPartToSculptMesh } from './partMesh/sculptConversion';

export { releasePartGroup } from './partMesh/sharedGeometry';

const hasSculptMesh = (part: ScenePart) => Boolean(part.sculptMesh && part.sculptMesh.positions.length >= 9);

export function applyPartTransform(group: THREE.Object3D, part: Pick<ScenePart, 'position' | 'rotation'>): void {
  group.position.set(part.position[0], part.position[1], part.position[2]);
  group.rotation.set(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2]),
  );
}

const nestedBuild = (part: ScenePart, selected: boolean) => buildPartGroup(part, selected);

const BUILDERS = partBuilders(nestedBuild);

export function buildPartGroup(part: ScenePart, isSelected: boolean, options: BuildOptions = {}): THREE.Group {
  const ctx = createContext(part, isSelected, options);
  const build = hasSculptMesh(part) ? sculptedPart : BUILDERS[part.kind];

  build?.(ctx);
  applyPartTransform(ctx.group, part);
  ctx.group.traverse((object) => {
    object.userData.partId = part.id;
  });

  return ctx.group;
}

export function convertScenePartToSculptMesh(part: ScenePart): SculptMeshData {
  return convertPartToSculptMesh(part, nestedBuild);
}
