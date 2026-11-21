import type { DesignParameter } from './types';

export function validateDeviation(parameter: DesignParameter) {
  const tolerance = parameter.tolerance;

  if (tolerance === undefined) return;

  if (
    !tolerance ||
    parameter.unit !== 'mm' ||
    parameter.expression !== undefined ||
    !Number.isFinite(tolerance.lower) ||
    !Number.isFinite(tolerance.upper) ||
    tolerance.lower > tolerance.upper ||
    !Number.isFinite(parameter.value + tolerance.lower) ||
    !Number.isFinite(parameter.value + tolerance.upper)
  )
    throw new Error(`Declare lower and upper manufacturing deviations around ${parameter.name} in mm.`);
}
