export interface SculptMeshData {
  positions: number[];
  indices?: number[];
}

export type SculptBrushKind = 'inflate' | 'carve' | 'flatten' | 'smooth' | 'pinch' | 'grab';

export interface SculptSettings {
  brush: SculptBrushKind;
  radiusMm: number;
  strength: number;
  symmetryX: boolean;
  symmetryZ: boolean;
}
