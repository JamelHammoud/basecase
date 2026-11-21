import { BODY_ANALYSIS_METHOD as NOISE, type BodyAnalysisDirection } from './bodyAnalysisTypes';
import { BODY_MOTION_METHOD, type BodyMotionScore } from './bodyMotionTypes';
import { bodySensitivity } from './bodySensitivity';

function orthonormal(directions: BodyAnalysisDirection[]): boolean {
  return directions.every((direction, index) =>
    directions.every((other, second) => {
      const dot = direction.weights.reduce((sum, weight, row) => sum + weight * other.weights[row], 0);

      return Math.abs(dot - Number(index === second)) < BODY_MOTION_METHOD.basisTolerance;
    }),
  );
}

function profiledResponse(weights: number[], directions: BodyAnalysisDirection[]): number {
  let variance = 0;

  for (const direction of directions) {
    const loading = weights.reduce((sum, weight, index) => sum + weight * direction.weights[index], 0);

    if (Math.abs(loading) < NOISE.orthogonalityTolerance) continue;

    if (direction.response <= NOISE.orthogonalityTolerance) return 0;

    variance += (loading / direction.response) ** 2;
  }

  return variance > 0 ? 1 / Math.sqrt(variance) : 0;
}

function combinedColumns(original: BodyAnalysisDirection[], candidate: Float64Array[]): Float64Array[] {
  const samples = candidate[0]?.length ?? 0;
  const rows = original.length + samples;

  return candidate.map((column, index) =>
    Float64Array.from([
      ...original.map((direction) => direction.response * direction.weights[index] * Math.sqrt(rows)),
      ...column.map((value) => value * Math.sqrt(rows / samples)),
    ]),
  );
}

interface MotionInformationInput {
  original: BodyAnalysisDirection[];
  candidate: Float64Array[];
  selected: number[];
}

function validInformation(input: MotionInformationInput): boolean {
  const { original, candidate, selected } = input;
  const size = original.length;

  return (
    size > 0 &&
    size <= 24 &&
    candidate.length === size &&
    candidate[0].length > 0 &&
    candidate.every((column) => column.length === candidate[0].length && column.every(Number.isFinite)) &&
    selected.length > 0 &&
    new Set(selected).size === selected.length &&
    selected.every((index) => Number.isInteger(index) && index >= 0 && index < size) &&
    original.every(
      (direction) =>
        direction.weights.length === size &&
        direction.weights.every(Number.isFinite) &&
        Number.isFinite(direction.response) &&
        direction.response >= 0,
    )
  );
}

export function bodyMotionInformation(input: MotionInformationInput): BodyMotionScore {
  const { original, candidate, selected } = input;

  if (!validInformation(input) || !orthonormal(original))
    throw new Error('Body motion information is outside its numerical bounds');

  const directions = bodySensitivity(combinedColumns(original, candidate)).directions;
  const targets = original.filter(
    (direction) =>
      !direction.distinguishable &&
      selected.some((index) => Math.abs(direction.weights[index]) >= NOISE.directionLoading),
  );
  const responses = targets.map((direction) => ({
    before: profiledResponse(direction.weights, original),
    after: profiledResponse(direction.weights, directions),
  }));
  const before = Math.min(...responses.map((response) => response.before), 1e100);
  const after = Math.min(...responses.map((response) => response.after), 1e100);
  const threshold = Math.max(NOISE.absoluteResponse, directions[0].response * NOISE.relativeResponse);
  const gain = Math.min(...responses.map((response) => response.after - response.before), 1e100);

  return {
    before: targets.length ? before : 0,
    after: targets.length ? after : 0,
    gain: targets.length ? gain : 0,
    resolved: targets.length > 0 && after >= threshold && gain >= BODY_MOTION_METHOD.minimumGain,
    directions,
  };
}
