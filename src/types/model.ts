export interface ModelMaterial {
  name: string;
  roughness: number;
  metalness: number;
  opacity: number;
  transparent: boolean;
  doubleSided: boolean;
}

export interface ModelMeshData {
  positions: number[];
  indices: number[];
  baseSize: [number, number, number];
  source?: string;
  file?: string;
  material?: ModelMaterial;
  colors?: number[];
  visual?: { key: string; node: string; matrix: number[] };
}
