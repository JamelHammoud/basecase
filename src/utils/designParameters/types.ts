export type ParameterUnit = 'mm' | 'deg' | '1';

export interface Quantity {
  value: number;
  unit: ParameterUnit;
}

export interface FitDimensionChoice {
  kind: 'design-choice';
  value: number;
  sourceSha256: string;
  sourcePart: string;
  binding: DimensionBinding;
  interface: { id: string; key: string };
  down: [number, number, number];
  material: string;
}

export type DesignParameter = { name: string; unit: ParameterUnit; fitChoice?: FitDimensionChoice } & (
  { value: number; expression?: never } | { expression: string; value?: never }
);

export interface DimensionBinding {
  kind: 'primitive' | 'cad' | 'sketch';
  target: string;
  unit: ParameterUnit;
  expression: string;
}

export const PARAMETER_LIMITS = {
  declarations: 128,
  bindings: 512,
  expression: 256,
  tokens: 64,
  depth: 16,
} as const;
