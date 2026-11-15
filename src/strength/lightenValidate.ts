import type { LightenInput } from './lightenTypes';
import type { ScrewLine, StrengthJob, V3 } from './types';

const finiteVector = (vector: V3) => vector.length === 3 && vector.every(Number.isFinite);
const nonzeroVector = (vector: V3) => finiteVector(vector) && Math.hypot(...vector) > 1e-9;
const validLine = (line: ScrewLine) =>
  finiteVector(line.from) &&
  finiteVector(line.to) &&
  Number.isFinite(line.radius) &&
  line.radius > 0 &&
  Math.hypot(...line.to.map((value, axis) => value - line.from[axis])) > 1e-9;
const validJob = (job: StrengthJob) =>
  Number.isFinite(job.load.torqueNmm) &&
  job.load.torqueNmm !== 0 &&
  finiteVector(job.load.origin) &&
  nonzeroVector(job.load.axis) &&
  (!job.down || nonzeroVector(job.down)) &&
  Number.isFinite(job.infillPct) &&
  job.infillPct >= 0 &&
  job.infillPct <= 100 &&
  job.holds.length > 0 &&
  job.load.screws.length > 0 &&
  [...job.holds, ...job.load.screws].every(validLine);

function validateGrid(input: LightenInput): number {
  const positions = input.positions;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }

  const sizes = min.map((value, axis) => max[axis] - value);
  const divisions = sizes.map((value) => Math.max(1, Math.ceil(value / 1.5)));
  const spacing = Math.min(1.5, ...sizes.map((value, axis) => value / (divisions[axis] - 0.5 + 1e-6)));
  const dimensions = sizes.map((value) => Math.max(1, Math.round(value / spacing)));
  const cells = dimensions.reduce((product, value) => product * value, 1);
  const reach = sizes.map((value, axis) => Math.ceil((input.minWallMm * dimensions[axis]) / value));
  const morphologyWork = cells * 8 * reach.reduce((product, value) => product * (value * 2 + 1), 1);

  if (input.minWallMm > Math.min(...sizes)) throw new Error('The minimum wall exceeds the printed part thickness.');

  if (sizes.some((value) => value <= 0) || cells > 1_500_000 || morphologyWork > 100_000_000)
    throw new Error('The printed part exceeds the lightening grid limit.');

  return spacing;
}

export function validateLighten(input: LightenInput): number {
  if (!input.positions.length || input.positions.length % 9 !== 0 || !input.positions.every(Number.isFinite))
    throw new Error('The printed part must have finite triangle positions.');

  if (!input.jobs.length || !input.jobs.every(validJob))
    throw new Error('The printed part needs measured loads and supports.');

  if (!Number.isFinite(input.targetShare) || input.targetShare <= 0 || input.targetShare >= 1)
    throw new Error('Choose a target share between zero and one.');

  if (!Number.isFinite(input.minWallMm) || input.minWallMm < 1)
    throw new Error('Choose a minimum wall of at least 1 mm.');

  validateFrozen(input);

  return validateGrid(input);
}

function validateFrozen(input: LightenInput): void {
  if (input.frozen?.lines?.some((line) => !validLine(line)))
    throw new Error('The mounting holes need finite positions and radii.');

  if (
    input.frozen?.planes?.some(
      (plane) =>
        !finiteVector(plane.point) ||
        !nonzeroVector(plane.normal) ||
        !Number.isFinite(plane.halfThickness) ||
        plane.halfThickness < 0,
    )
  )
    throw new Error('The mounting faces need finite positions and normals.');

  if (
    input.frozen?.boxes?.some(
      (box) =>
        !finiteVector(box.min) || !finiteVector(box.max) || box.min.some((value, axis) => value >= box.max[axis]),
    )
  )
    throw new Error('The mounting regions need finite bounds.');
}
