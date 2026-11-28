import type { ForceEvidence } from '../sim/contactForces';
import type { Recording } from '../sim/recorder';

const key = (value: unknown) => typeof value === 'string' && /^[a-z0-9]+$/.test(value);
const bodies = (value: unknown, nbody: number): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= nbody &&
  value.every((body) => Number.isInteger(body) && body >= 0 && body < nbody) &&
  new Set(value).size === value.length;

export function forceEvidenceFits(value: unknown, nbody: number): value is ForceEvidence | undefined {
  if (value === undefined) return true;

  const e = value as ForceEvidence | null;

  return (
    !!e &&
    e.version === 1 &&
    key(e.caseKey) &&
    key(e.modelKey) &&
    nativeEvidenceFits(e) &&
    Array.isArray(e.channels) &&
    e.channels.length > 0 &&
    e.channels.length <= 64 &&
    new Set(e.channels.map((c) => c?.signal)).size === e.channels.length &&
    e.channels.every(
      (c) =>
        c &&
        typeof c.signal === 'string' &&
        /^[\w-]{1,128}$/.test(c.signal) &&
        bodies(c.jaws, nbody) &&
        bodies(c.target, nbody) &&
        !c.jaws.some((body) => c.target.includes(body)) &&
        typeof c.peak === 'boolean' &&
        (c.ceilingN === undefined || (Number.isFinite(c.ceilingN) && c.ceilingN > 0)),
    )
  );
}

export function forceArraysFit(recording: Recording): boolean {
  const { forceEvidence: e, contactForce: values, contactForcePeak: peaks } = recording;

  if (!e) return !values && !peaks;

  const width = e.channels.length;
  const count = width * recording.frames;

  return (
    values instanceof Float64Array &&
    peaks instanceof Float64Array &&
    values.length === count &&
    peaks.length === count &&
    values.every((value) => Number.isFinite(value) && value >= 0) &&
    peaks.every((value, i) => Number.isFinite(value) && value >= values[i] && (i < width || value >= peaks[i - width]))
  );
}

export function sliceForces(recording: Recording, range: { from: number; to: number }) {
  const width = recording.forceEvidence?.channels.length;

  if (!width) return {};

  return {
    contactForce: recording.contactForce?.slice(range.from * width, range.to * width),
    contactForcePeak: recording.contactForcePeak?.slice(range.from * width, range.to * width),
  };
}

function nativeEvidenceFits(e: ForceEvidence): boolean {
  return (
    typeof e.runtime === 'string' &&
    e.runtime.length > 0 &&
    e.runtime.length < 100 &&
    typeof e.timestep === 'number' &&
    Number.isFinite(e.timestep) &&
    e.timestep > 0 &&
    key(e.physicsKey)
  );
}
