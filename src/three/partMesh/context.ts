import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import { applyDeformersToBufferGeometry } from '../sculptAndBooleanEngine';
import { createMaterial, crispEdgeMaterial } from './materials';
import { acquireShared, markShared } from './sharedGeometry';

export type AccentMaterial = 'primary' | 'dark' | 'metal' | 'brass';

const ACCENTS: Record<Exclude<AccentMaterial, 'primary'>, { color: string; roughness: number; metalness: number }> = {
  dark: { color: '#18181b', roughness: 0.5, metalness: 0.2 },
  metal: { color: '#d4d4d8', roughness: 0.25, metalness: 0.65 },
  brass: { color: '#eab308', roughness: 0.3, metalness: 0.5 },
};

export interface BuildOptions {
  shareGeometry?: boolean;
}

export interface BuildContext {
  part: ScenePart;
  group: THREE.Group;
  selected: boolean;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  deformed: boolean;
  material: (accent?: AccentMaterial) => THREE.MeshStandardMaterial;
  deform: (geometry: THREE.BufferGeometry) => THREE.BufferGeometry;
  subMesh: (geometry: THREE.BufferGeometry, material?: THREE.Material, edgeThreshold?: number) => THREE.Mesh;
  add: (geometry: THREE.BufferGeometry, material?: THREE.Material, edgeThreshold?: number) => THREE.Mesh;
  derive: <T>(key: string, build: () => T, dispose: (value: T) => void) => T;
}

const NO_DEFORM_EPSILON = { taper: 0.001, bend: 0.1, twist: 0.1, round: 0.001 };

export function hasDeformers(part: Pick<ScenePart, 'deformers'>): boolean {
  const d = part.deformers;

  if (!d) {
    return false;
  }

  return (
    Math.abs(d.taper || 0) > NO_DEFORM_EPSILON.taper ||
    Math.abs(d.bendDeg || 0) > NO_DEFORM_EPSILON.bend ||
    Math.abs(d.twistDeg || 0) > NO_DEFORM_EPSILON.twist ||
    (d.roundness || 0) > NO_DEFORM_EPSILON.round
  );
}

export function makeSubMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  style: { role: ScenePart['role']; selected: boolean; edgeThreshold?: number },
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, style.edgeThreshold ?? 22),
    crispEdgeMaterial(style.role, style.selected),
  );

  mesh.castShadow = style.role === 'solid';
  mesh.receiveShadow = style.role === 'solid';
  lines.name = 'cad-edges';
  lines.raycast = () => {};
  mesh.add(lines);

  return mesh;
}

export function plainMesh(geometry: THREE.BufferGeometry, material: THREE.Material, role: ScenePart['role']) {
  const mesh = new THREE.Mesh(geometry, material);

  mesh.castShadow = role === 'solid';
  mesh.receiveShadow = role === 'solid';

  return mesh;
}

const sharedDerive =
  (group: THREE.Group) =>
  <T>(key: string, build: () => T, dispose: (value: T) => void): T => {
    const keys = (group.userData.sharedKeys as string[] | undefined) ?? [];

    group.userData.sharedKeys = [...keys, key];

    return acquireShared(key, () => markShared(build()), dispose);
  };

const ownedDerive = <T>(_key: string, build: () => T): T => build();

export function createContext(part: ScenePart, selected: boolean, options: BuildOptions = {}): BuildContext {
  const group = new THREE.Group();
  const { width, height, depth, thickness = 4 } = part.dimensions;
  const deformed = hasDeformers(part);
  const materials = new Map<AccentMaterial, THREE.MeshStandardMaterial>();
  const style = { role: part.role, selected };

  group.name = part.id;
  group.userData = { partId: part.id, sharedKeys: [] };

  const material = (accent: AccentMaterial = 'primary') => {
    const existing = materials.get(accent);

    if (existing) {
      return existing;
    }

    const params = accent === 'primary' ? { color: part.color } : ACCENTS[accent];
    const created = createMaterial({ ...params, role: part.role, selected });

    materials.set(accent, created);

    return created;
  };

  const deform = (geometry: THREE.BufferGeometry) => {
    if (deformed) applyDeformersToBufferGeometry(geometry, part.deformers);

    return geometry;
  };

  const subMesh = (geometry: THREE.BufferGeometry, mat?: THREE.Material, edgeThreshold?: number) =>
    makeSubMesh(geometry, mat ?? material(), { ...style, edgeThreshold });

  const add = (geometry: THREE.BufferGeometry, mat?: THREE.Material, edgeThreshold?: number) => {
    const mesh = subMesh(geometry, mat, edgeThreshold);

    group.add(mesh);

    return mesh;
  };

  return {
    part,
    group,
    selected,
    width,
    height,
    depth,
    thickness,
    deformed,
    material,
    deform,
    subMesh,
    add,
    derive: options.shareGeometry ? sharedDerive(group) : ownedDerive,
  };
}
