import type { Recording } from '../sim/recorder';
import { boundedInteger, recordValue, stringList, stringValue } from './recordValues';

export const VISIBILITY_WIDTH = 320;
export const VISIBILITY_HEIGHT = 240;
export const MAX_VISIBILITY_SAMPLES = 32;
export const MAX_VISIBILITY_PASSES = 1024;

export interface VisibilityTarget {
  id: string;
  minPixels: number;
}

export interface StudyVisibilityRequest {
  tryId: string;
  cameras: string[];
  targets: VisibilityTarget[];
  samples: number;
}

export function validVisibilityRequest(value: unknown): value is StudyVisibilityRequest {
  if (!recordValue(value) || !stringValue(value.tryId) || !value.tryId.trim()) return false;

  if (!stringList(value.cameras) || value.cameras.length > 8 || new Set(value.cameras).size !== value.cameras.length)
    return false;

  if (!Array.isArray(value.targets) || !value.targets.length || value.targets.length > 16) return false;

  return (
    value.targets.every(
      (target) =>
        recordValue(target) &&
        stringValue(target.id) &&
        !!target.id.trim() &&
        boundedInteger(target.minPixels, VISIBILITY_WIDTH * VISIBILITY_HEIGHT) &&
        (target.minPixels as number) > 0,
    ) &&
    new Set(value.targets.map((target) => target.id)).size === value.targets.length &&
    boundedInteger(value.samples, MAX_VISIBILITY_SAMPLES) &&
    (value.samples as number) >= 2
  );
}

export function visibilityPlan(
  request: StudyVisibilityRequest,
  recording: Pick<Recording, 'frames' | 'dt' | 't'>,
  candidates: number,
) {
  if (!validVisibilityRequest(request)) throw new Error('Choose a saved try, cameras, targets and 2 to 32 samples.');

  if (recording.frames < 2 || recording.t.length !== recording.frames || recording.dt <= 0)
    throw new Error('Choose a try with at least 2 timed frames.');

  const count = Math.min(request.samples, recording.frames);
  const passes = (candidates + 1) * count * request.cameras.length * (request.targets.length + 1);

  if (passes > MAX_VISIBILITY_PASSES)
    throw new Error('Reduce the designs, cameras, targets or samples to at most 1024 visibility passes.');

  const indices = Array.from({ length: count }, (_, i) => Math.round((i * (recording.frames - 1)) / (count - 1)));
  const times = indices.map((index) => recording.t[index]);

  if (times.some((time, i) => !Number.isFinite(time) || time < 0 || (i > 0 && time <= times[i - 1])))
    throw new Error('Choose a try with increasing sample times.');

  return { indices, times, end: times.at(-1)! + recording.dt, passes };
}
