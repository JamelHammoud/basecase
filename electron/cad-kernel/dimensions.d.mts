export interface ScadDimension {
  name: string;
  value: number;
  start: number;
  end: number;
  min?: number;
  max?: number;
  step?: number;
}

export function scadDimensions(code: string): ScadDimension[];
export function clampDimension(dim: Pick<ScadDimension, 'min' | 'max'>, value: number): number;
export function formatDimension(value: number): string;
export function rewriteDimensions(code: string, values: Record<string, number>): string;
