import * as THREE from 'three';

export type Geometry =
  | { type: 'mesh'; file: string; scale: THREE.Vector3; from?: string }
  | { type: 'box'; size: THREE.Vector3 }
  | { type: 'cylinder'; radius: number; length: number }
  | { type: 'capsule'; radius: number; length: number }
  | { type: 'sphere'; radius: number }
  | { type: 'ellipsoid'; radii: THREE.Vector3 };

export type MeshGeometry = Extract<Geometry, { type: 'mesh' }>;

export interface Visual {
  geometry: Geometry;
  origin: THREE.Matrix4;
  color?: THREE.Color;
}

export interface ModelJoint {
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed';
  parent: string;
  child: string;
  world: THREE.Matrix4;
  axis: THREE.Vector3;
  limit?: [number, number];
  effort?: number;
  velocity?: number;
  after?: ModelJoint;
}

export interface ModelLink {
  world: THREE.Matrix4;
  visuals: Visual[];
  mass?: number;
  com?: THREE.Vector3;
}

export interface Model {
  name: string;
  links: Map<string, ModelLink>;
  joints: ModelJoint[];
  root: string;
}

export const displayRgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export const nums = (s: string | null | undefined, def: number[]) => (s ? s.trim().split(/\s+/).map(Number) : def);
export const elems = (el: Element, tag: string) => [...el.children].filter((c) => c.tagName === tag);
export const elem = (el: Element | null | undefined, tag: string) =>
  el ? ([...el.children].find((c) => c.tagName === tag) ?? null) : null;

export const unitScale = () => new THREE.Vector3(1, 1, 1);
