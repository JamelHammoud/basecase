import type { V3 } from '../utils/kinematics';

export interface DroppedFile {
  name: string;
  bytes: Uint8Array;
}

export type SplatFormat = 'spz' | 'ply';

export type MeshFormat = 'glb' | 'gltf' | 'obj';

export interface WorldFrame {
  mmPerUnit: number;
  liftMm: number;
  flip?: boolean;
}

export interface WorldLook {
  mesh: { file: string; format: MeshFormat };
  splat?: { file: string; format: SplatFormat; points: number };
}

export interface WorldSource {
  name: string;
  files: DroppedFile[];
  look: WorldLook;
  frame: WorldFrame;
  positions: Float32Array;
  indices: Uint32Array;
}

export interface WorldPiece {
  center: V3;
  vertices: number[];
  ground: boolean;
}

export interface WorldBounds {
  min: [number, number];
  max: [number, number];
}

export interface MeshWorld {
  hash: string;
  name: string;
  pieces: WorldPiece[];
  bounds: WorldBounds;
}

export interface StoredWorld extends MeshWorld {
  files: DroppedFile[];
  look: WorldLook;
  frame: WorldFrame;
}

export interface WorldMeshRef {
  hash: string;
  name: string;
  at: V3;
}
