import type { Port, PortKind } from './ports';

export type { PartRelations } from './ports';

export type CadPortKind = PortKind;

export interface CadPort extends Port {
  check?: 'ok' | 'failed' | 'unchecked';
  problem?: string;
}

export interface CadCraft {
  envelopeSharp: number | null;
  interiorSharp: number | null;
  dominantRadius: number | null;
  dominantShare: number;
  radii: number[];
  solidity: number | null;
  boxiness: number | null;
  thicknessMm: number | null;
  areaMm2: number;
  walls: { modalMm: number; consistent: number; p5Mm: number; thinShare: number } | null;
}

export interface CadAudit {
  bodies: number;
  voids?: number;
  genus: number | null;
  nonManifoldEdges: number;
  openEdges: number;
  hullVolume: number | null;
  craft?: CadCraft;
}

export type CadExpect = Record<string, unknown>;

export interface CadExtras {
  ports?: CadPort[];
  audit?: CadAudit;
  expect?: CadExpect;
}
