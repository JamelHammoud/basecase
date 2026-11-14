import * as THREE from 'three';
import type { StoredWorld, WorldFrame } from '../cases/worldTypes';
import type { V3 } from '../utils/kinematics';
import { lookMeshScene } from './worldLookMesh';
import { loadSplat } from './worldLookSplat';

export const WORLD_LOOK = 'world-look';

export type LookKind = 'splat' | 'mesh';

export interface BuiltLook {
  object: THREE.Group;
  kind: LookKind;
  dispose: () => void;
}

const isTexture = (value: unknown): value is THREE.Texture => (value as THREE.Texture | null)?.isTexture === true;

function disposeMaterial(material: THREE.Material): void {
  Object.values(material).forEach((value) => isTexture(value) && value.dispose());
  material.dispose();
}

export function disposeLookTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const drawable = object as THREE.Mesh;

    if (!drawable.geometry) return;

    drawable.geometry.dispose();
    [drawable.material].flat().forEach((m) => m && disposeMaterial(m));
  });
}

export function placeLook(object: THREE.Object3D, frame: WorldFrame, at: V3): void {
  object.scale.setScalar(frame.mmPerUnit);
  object.rotation.set(frame.flip ? Math.PI : 0, 0, 0);
  object.position.set(at[0], at[1] + frame.liftMm, at[2]);
  object.updateMatrixWorld(true);
}

function lookGroup(child: THREE.Object3D, kind: LookKind, hash: string): THREE.Group {
  const group = new THREE.Group();

  group.name = WORLD_LOOK;
  group.userData = { look: kind, world: hash };
  group.add(child);

  return group;
}

function receivesShadows(root: THREE.Object3D): void {
  root.traverse((object) => {
    object.castShadow = false;
    object.receiveShadow = true;
  });
}

export async function buildWorldLook(world: StoredWorld): Promise<BuiltLook> {
  const { splat, mesh } = world.look;

  if (splat) {
    const splats = await loadSplat(splat, world.files);

    return { object: lookGroup(splats, 'splat', world.hash), kind: 'splat', dispose: () => splats.dispose() };
  }

  const scene = await lookMeshScene(mesh, world.files);

  receivesShadows(scene);

  return { object: lookGroup(scene, 'mesh', world.hash), kind: 'mesh', dispose: () => disposeLookTree(scene) };
}
