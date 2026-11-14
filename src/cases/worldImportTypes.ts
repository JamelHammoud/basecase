import type { Room } from './roomPlan';

export interface WorldImportFile {
  name: string;
  bytes: Uint8Array;
}

export interface WorldImportOptions {
  units?: 'auto' | 'm' | 'mm';
}

export interface WorldMaterial {
  name: string;
  color: [number, number, number, number];
  roughness: number;
  metalness: number;
  image?: {
    bytes: Uint8Array;
    mimeType: string;
    flipY?: boolean;
    wrapS?: 'repeat' | 'clamp' | 'mirror';
    wrapT?: 'repeat' | 'clamp' | 'mirror';
  };
  doubleSided?: boolean;
}

export interface WorldMeshGroup {
  start: number;
  count: number;
  material: number;
}

export interface WorldMesh {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  colors?: Float32Array;
  uvs?: Float32Array;
  groups: WorldMeshGroup[];
  materials: WorldMaterial[];
}

export interface ImportedMeshWorld {
  kind: 'mesh';
  name: string;
  mesh: WorldMesh;
  transform: {
    scale: number;
    quaternion: [number, number, number, number];
    translation: [number, number, number];
  };
  splat?: { name: string; bytes: Uint8Array; format: 'spz' | 'ply'; count: number };
}

export type ImportedWorld = { kind: 'room'; room: Room } | ImportedMeshWorld;
