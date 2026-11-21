import {
  BODY_ANALYSIS_LIMITS,
  BODY_ANALYSIS_METHOD as METHOD,
  type BodyAnalysisDirection,
  type BodyDistinguishability,
} from './bodyAnalysisTypes';

export function normalizedBodyResponse(input: {
  low: Float64Array;
  high: Float64Array;
  span: number;
  scale: number;
}): Float64Array {
  const { low, high, span, scale } = input;
  const multiplier = scale / span;

  if (low.length !== high.length || !(span > 0 && scale > 0 && Number.isFinite(multiplier)))
    throw new Error('Body perturbation is outside its numerical bounds');

  const column = high.map((value, index) => (value - low[index]) * multiplier);

  if (!column.every(Number.isFinite)) throw new Error('Body perturbation produced a nonfinite response');

  return column;
}

const dot = (a: Float64Array, b: Float64Array) => a.reduce((sum, value, index) => sum + value * b[index], 0);

function rotate(a: Float64Array, b: Float64Array, cosine: number, sine: number) {
  for (let row = 0; row < a.length; row++) {
    const x = a[row];
    const y = b[row];

    a[row] = cosine * x - sine * y;
    b[row] = sine * x + cosine * y;
  }
}

function orthogonalize(columns: Float64Array[], vectors: Float64Array[]): boolean {
  let changed = false;

  for (let p = 0; p < columns.length; p++) {
    for (let q = p + 1; q < columns.length; q++) {
      const alpha = dot(columns[p], columns[p]);
      const beta = dot(columns[q], columns[q]);
      const gamma = dot(columns[p], columns[q]);

      if (Math.abs(gamma) <= METHOD.orthogonalityTolerance * Math.sqrt(alpha * beta)) continue;

      const zeta = (beta - alpha) / (2 * gamma);
      const tangent = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.hypot(1, zeta));
      const cosine = 1 / Math.hypot(1, tangent);
      const sine = cosine * tangent;

      rotate(columns[p], columns[q], cosine, sine);
      rotate(vectors[p], vectors[q], cosine, sine);
      changed = true;
    }
  }

  return changed;
}

function decomposition(input: Float64Array[]) {
  const columns = input.map((column) => column.slice());
  const vectors = input.map((_, index) => Float64Array.from(input, (_, row) => Number(index === row)));
  let converged = false;

  for (let sweep = 0; sweep < METHOD.sweeps; sweep++) {
    if (orthogonalize(columns, vectors)) continue;

    converged = true;

    break;
  }

  if (!converged) throw new Error('Body sensitivity decomposition did not converge');

  return columns
    .map((column, index) => ({ column, weights: Array.from(vectors[index]), response: Math.sqrt(dot(column, column)) }))
    .sort((a, b) => b.response - a.response);
}

export function bodySensitivity(input: Float64Array[], residual?: Float64Array) {
  const samples = input[0]?.length ?? 0;
  const valid =
    samples > 0 &&
    samples <= BODY_ANALYSIS_LIMITS.samples * BODY_ANALYSIS_LIMITS.joints &&
    input.length <= BODY_ANALYSIS_LIMITS.parameters &&
    input.every((column) => column.length === samples && column.every(Number.isFinite)) &&
    (!residual || (residual.length === samples && residual.every(Number.isFinite)));

  if (!valid) throw new Error('Body sensitivity matrix is outside its numerical bounds');

  const divisor = Math.sqrt(samples);
  const modes = decomposition(input.map((column) => column.map((value) => value / divisor)));

  if (modes.some((mode) => !Number.isFinite(mode.response))) throw new Error('Body sensitivity norm overflowed');

  const threshold = Math.max(METHOD.absoluteResponse, modes[0].response * METHOD.relativeResponse);
  const directions: BodyAnalysisDirection[] = modes.map(({ weights, response }) => ({
    weights,
    response,
    distinguishable: response >= threshold,
  }));
  const responses = input.map((column) => Math.sqrt(dot(column, column) / samples));
  const parameters: BodyDistinguishability[] = responses.map((response, index) => {
    if (response < METHOD.absoluteResponse) return 'poor-excitation';

    const coupled = directions.some(
      (direction) => !direction.distinguishable && Math.abs(direction.weights[index]) >= METHOD.directionLoading,
    );

    return coupled ? 'coupled' : 'distinguishable';
  });
  const remainder = residual?.map((value) => value / divisor);

  if (remainder && !Number.isFinite(dot(remainder, remainder))) throw new Error('Body residual norm overflowed');

  modes.forEach((mode, index) => {
    if (!remainder || !directions[index].distinguishable) return;

    const amount = dot(remainder, mode.column) / (mode.response * mode.response);

    remainder.forEach((value, row) => {
      remainder[row] = value - amount * mode.column[row];
    });
  });

  return {
    parameters,
    directions,
    responses,
    outsideSupportedDirections: remainder ? Math.sqrt(dot(remainder, remainder)) : 0,
  };
}
