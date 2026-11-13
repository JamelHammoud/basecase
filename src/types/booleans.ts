import type { PartDimensions, ScenePart } from './robotics';
import type { BooleanRecipe } from './step';

export type BooleanOp = 'subtract' | 'union' | 'intersect';

export interface BooleanFrame {
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: PartDimensions;
}

export interface BooleanData {
  op: BooleanOp;
  operands: ScenePart[];
  hash?: string;
  frame?: BooleanFrame;
}

export interface BooleanFields {
  boolean?: BooleanData;
  csg?: BooleanRecipe;
}
