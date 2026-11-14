export interface PartDeformers {
  taper?: number;
  bendDeg?: number;
  twistDeg?: number;
  roundness?: number;
}

export interface PartEdges {
  kind: 'fillet' | 'chamfer';
  mm: number;
}
