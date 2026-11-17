import type { ProjectSettings, Purchases, ScenePart } from '../types/robotics';
import type { PurchaseIdentity } from '../types/purchasing';

export type DrawingPoint = [number, number];
export type DrawingVector = [number, number, number];

export interface DrawingOptions {
  frame: 'part' | 'scene';
  plane: 'xy' | 'xz' | 'yz';
  scale: number;
}

export interface DrawingSource {
  id: string;
  name: string;
  fingerprint: string;
}

export interface DrawingJob {
  source: DrawingSource;
  parts: ScenePart[];
  options: DrawingOptions;
  purchases?: Purchases;
  sourceSnapshot?: { parts: ScenePart[]; project: ProjectSettings };
}

export interface DrawingHole {
  center: DrawingPoint;
  diameterMm: number;
  approximate: true;
  residualMm: number;
  chordErrorMm: number;
}

export interface DrawingLine {
  a: DrawingPoint;
  b: DrawingPoint;
  hidden: boolean;
}

export interface DrawingView {
  name: 'front' | 'top' | 'right';
  lines: DrawingLine[];
}

export interface DrawingSheet {
  id: string;
  svg: string;
  partIds: string[];
  name: string;
  quantity: number;
  material: string | null;
  geometryFingerprint: string;
  geometryFile: string;
  geometryFileFingerprint: string;
  geometryFrame: 'Z-up';
  projectionMatrix: number[];
  units: 'mm';
  scale: number;
  frame: DrawingOptions;
  datum: DrawingVector;
  extents: DrawingVector;
  mode: 'profile' | 'outline-only';
  thicknessMm?: number;
  holes: DrawingHole[];
  authoredSketch?: { entities: string[]; depthMm: number };
  omittedHoleDimensions?: number;
  edges?: Array<{ a: DrawingPoint; b: DrawingPoint; lengthMm: number }>;
  views: DrawingView[];
}

export interface DrawingManifest {
  format: 'basecase-mechanical-drawings';
  schema: 1;
  source: DrawingSource;
  numericalToleranceMm: number;
  circleChordToleranceMm: number;
  sheets: DrawingSheet[];
  references: Array<{ partId: string; key: string; identity?: PurchaseIdentity }>;
}

export const DRAWING_LIMITS = {
  parts: 256,
  triangles: 100000,
  totalTriangles: 250000,
  lines: 12000,
  dimensions: 128,
  bytes: 64 * 1024 * 1024,
  toleranceMm: 0.002,
  chordMm: 0.025,
};
