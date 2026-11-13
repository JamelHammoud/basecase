import type { ScenePart } from './robotics';

type V3 = [number, number, number];

export interface RecipePart extends Pick<ScenePart, 'kind' | 'position' | 'rotation' | 'dimensions'> {
  cad?: Pick<NonNullable<ScenePart['cad']>, 'language' | 'code' | 'originOffset' | 'baseSize'>;
  csg?: BooleanRecipe;
}

export interface BooleanRecipe {
  op: 'subtract' | 'union' | 'intersect';
  origin: [number, number, number];
  size: [number, number, number];
  operands: RecipePart[];
}

export type StepSolid =
  | { type: 'box'; size: V3 }
  | { type: 'cylinder'; radii: [number, number]; height: number }
  | { type: 'sphere'; radius: number }
  | { type: 'cone' | 'dome' | 'capsule'; radius: number; height: number }
  | { type: 'torus'; major: number; minor: number }
  | { type: 'code'; code: string }
  | { type: 'mesh'; positions: Float32Array | number[] }
  | { type: 'boolean'; op: BooleanRecipe['op']; solids: StepSolid[] }
  | { type: 'moved'; matrix: number[]; solid: StepSolid };

export interface StepBody {
  name: string;
  color: string;
  group?: string;
  place: number[];
  solid: StepSolid;
  fallback?: StepSolid;
}

export interface StepJob {
  name: string;
  bodies: StepBody[];
}

export interface ExportedStep {
  step: string;
  skipped: number;
}
