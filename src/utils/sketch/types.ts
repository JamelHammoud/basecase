export type Vec2 = [number, number];

export interface SketchPoint {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
}

export interface SketchLine {
  id: string;
  kind: 'line';
  a: string;
  b: string;
  ref?: boolean;
}

export interface SketchCircle {
  id: string;
  kind: 'circle';
  c: string;
  r: number;
}

export interface SketchArc {
  id: string;
  kind: 'arc';
  c: string;
  a: string;
  b: string;
}

export type SketchEntity = SketchLine | SketchCircle | SketchArc;

export type PairKind = 'parallel' | 'perpendicular' | 'equal' | 'tangent';

export type SketchConstraint =
  | { id: string; kind: 'coincident'; a: string; b: string }
  | { id: string; kind: 'horizontal' | 'vertical'; line: string }
  | { id: string; kind: PairKind; a: string; b: string }
  | { id: string; kind: 'length'; line: string; value: number }
  | { id: string; kind: 'radius'; entity: string; value: number }
  | { id: string; kind: 'angle'; line: string; other?: string; value: number }
  | { id: string; kind: 'distance'; a: string; b: string; value: number };

export type ConstraintKind = SketchConstraint['kind'];

export interface Sketch {
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export type SketchMode = 'extrude' | 'revolve';

export interface PartSketch {
  sketch: Sketch;
  mode: SketchMode;
  depth: number;
  anchor: Vec2;
}

export const EMPTY_SKETCH: Sketch = { points: [], entities: [], constraints: [] };

export const DIMENSION_KINDS: ReadonlySet<ConstraintKind> = new Set(['length', 'radius', 'angle', 'distance']);
