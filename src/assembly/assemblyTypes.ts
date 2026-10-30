import type { FastenerSpec, SolidRole } from './fastenerSpec';

export type V3 = [number, number, number];

export type ChainProblemCode = 'air' | 'short' | 'bottoms' | 'uncut' | 'unseated' | 'sunk';

export interface ChainProblem {
  code: ChainProblemCode;
  part?: string;
  mm?: number;
}

export type ThreadEnd = 'insert' | 'nut' | 'component' | 'printed' | 'none';

export interface FastenerChain {
  id: string;
  d: number;
  axis: V3;
  tip: V3;
  top: V3;
  headR: number;
  stack: string[];
  endsIn: { kind: ThreadEnd; id?: string };
  engagementMm: number;
  needMm: number | null;
  problems: ChainProblem[];
}

export interface SleeveHost {
  id: string;
  kind: 'insert' | 'nut' | 'washer';
  host: string | null;
  screw: string | null;
}

export interface ChainResult {
  screws: FastenerChain[];
  sleeves: SleeveHost[];
}

export interface FastenerInput {
  specs: FastenerSpec[];
  roles: Record<string, SolidRole>;
}
