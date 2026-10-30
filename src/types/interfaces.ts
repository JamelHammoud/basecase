import type { ZUpVec } from './skeleton';

export interface InterfaceBox {
  min: ZUpVec;
  max: ZUpVec;
}

export interface InterfaceDatum {
  name: string;
  kind: 'axis' | 'face';
  at?: ZUpVec;
  axis?: ZUpVec;
  joint?: string;
}

export interface BoltPattern {
  name: string;
  size: string;
  axis: ZUpVec;
  points: ZUpVec[];
}

export interface SeamScrews {
  with: string;
  size: string;
  count: number;
}

export interface InterfaceContract {
  owner: string;
  ids: string[];
  envelopes: InterfaceBox[];
  datums: InterfaceDatum[];
  boltPatterns: BoltPattern[];
  seams: SeamScrews[];
  style?: string;
}

export interface InterfacePlan {
  contracts: InterfaceContract[];
  known: string[];
}
