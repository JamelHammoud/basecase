export interface FacilityOptions {
  units: 'm' | 'mm' | 'cm';
  up: 'Y' | 'Z';
  floors?: string[];
  root?: string;
}

export interface FacilityGeometry {
  name: string;
  metersPerUnit: number;
  up: 'Y' | 'Z';
  positions: number[];
  indices: number[];
  lines: number[];
  points: number[];
  floors: string[];
  sources: { name: string; hash: string; bytes: number }[];
}

export interface PreparedGeometry extends Omit<FacilityGeometry, 'positions' | 'indices' | 'lines' | 'points'> {
  bounds: { min: [number, number, number]; max: [number, number, number] };
  positions: Float32Array;
  indices: Uint32Array;
  lines: Float32Array;
  points: Float32Array;
}

export interface FacilitySummary {
  name: string;
  hash: string;
  revision?: string;
  metersPerUnit: number;
  up: 'Y' | 'Z';
  floors: string[];
  sources: FacilityGeometry['sources'];
  sourceFrame?: { metersPerUnit: number; up: string; authoredUnits: boolean };
}
