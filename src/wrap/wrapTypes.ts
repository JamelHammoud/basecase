import type { V3 } from './solidField';

export type { V3 };

export const BASE_LINK = 'base';

export interface WrapBody {
  id: string;
  link: string;
  soup: Float32Array;
}

export interface WrapJoint {
  id: string;
  type: 'revolute' | 'prismatic';
  origin: V3;
  axis: V3;
  range: [number, number];
  parentLink: string;
  floor: boolean;
}

export interface WrapInput {
  mesh: Float32Array;
  bodies: WrapBody[];
  joints: WrapJoint[];
  floorY: number | null;
  wallMm?: number;
}

export interface WrapShell {
  link: string;
  positions: Float32Array;
  indices: Uint32Array;
}

export interface WrapResult {
  shells: WrapShell[];
  scale: number;
}

export const WALL_MM = 2;
