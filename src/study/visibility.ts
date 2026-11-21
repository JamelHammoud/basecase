import type { CameraTrainingFrame } from '../cameras/trainingTypes';
import type { VisibilityTarget } from './visibilityPlan';

export interface VisibilityPixels {
  pixels: number;
  potential: number;
}

export type VisibilityState = 'occluded' | 'outside' | 'below' | 'unavailable';

export interface VisibilityInterval {
  from: number;
  to: number;
  state: VisibilityState;
}

export interface VisibilityPair {
  camera: string;
  target: string;
  minPixels: number;
  pixels: Array<VisibilityPixels | null>;
  seconds: number;
  unavailableSeconds: number;
  intervals: VisibilityInterval[];
}

export interface StudyVisibilityResult {
  key: string;
  width: number;
  height: number;
  times: number[];
  end: number;
  coverage?: number;
  pairs: VisibilityPair[];
  targets: Array<{ id: string; seconds: number; unavailableSeconds: number }>;
  error?: string;
  preparationMs?: number;
  renderMs?: number;
}

function countPixels(frame: CameraTrainingFrame, target: string): number {
  const size = frame.width * frame.height;
  const id = frame.instances.find((entry) => entry.instance === target)?.id;

  if (frame.instanceIds.length !== size || frame.depth.length !== size || !id)
    throw new Error('Capture the declared target with matching instance and depth passes.');

  let pixels = 0;

  frame.instanceIds.forEach((value, i) => {
    if (value !== id) return;

    if (!Number.isFinite(frame.depth[i]) || frame.depth[i] <= 0)
      throw new Error('Capture the target with measured depth.');

    pixels++;
  });

  return pixels;
}

export function visibilitySample(
  actual: CameraTrainingFrame,
  isolated: CameraTrainingFrame,
  target: string,
): VisibilityPixels {
  if (actual.width !== isolated.width || actual.height !== isolated.height)
    throw new Error('Capture visibility passes at the same resolution.');

  return { pixels: countPixels(actual, target), potential: countPixels(isolated, target) };
}

function missState(pixels: VisibilityPixels | null, min: number): VisibilityState | null {
  if (!pixels) return 'unavailable';

  if (pixels.pixels >= min) return null;

  if (!pixels.potential) return 'outside';

  return pixels.pixels < pixels.potential ? 'occluded' : 'below';
}

interface VisibilitySummaryInput {
  key: string;
  width: number;
  height: number;
  times: number[];
  end: number;
  targets: VisibilityTarget[];
  cameras: string[];
  captures: Array<Array<Record<string, VisibilityPixels> | null>>;
}

function pairFor(input: VisibilitySummaryInput, cameraIndex: number, target: VisibilityTarget): VisibilityPair {
  const pixels = input.times.map((_, index) => input.captures[cameraIndex]?.[index]?.[target.id] ?? null);
  const intervals: VisibilityInterval[] = [];
  let seconds = 0;
  let unavailableSeconds = 0;

  pixels.forEach((sample, index) => {
    const from = input.times[index];
    const to = input.times[index + 1] ?? input.end;
    const state = missState(sample, target.minPixels);

    if (!state) seconds += to - from;

    if (state === 'unavailable') unavailableSeconds += to - from;

    if (!state) return;

    const previous = intervals.at(-1);

    if (previous?.state === state && previous.to === from) previous.to = to;
    else intervals.push({ from, to, state });
  });

  return {
    camera: input.cameras[cameraIndex],
    target: target.id,
    minPixels: target.minPixels,
    pixels,
    seconds,
    unavailableSeconds,
    intervals,
  };
}

function unionTarget(input: VisibilitySummaryInput, pairs: VisibilityPair[], target: VisibilityTarget) {
  const matching = pairs.filter((pair) => pair.target === target.id);
  let seconds = 0;
  let unavailableSeconds = 0;

  input.times.forEach((from, i) => {
    const duration = (input.times[i + 1] ?? input.end) - from;
    const met = matching.some((pair) => (pair.pixels[i]?.pixels ?? -1) >= target.minPixels);

    if (met) seconds += duration;

    if (!met && matching.some((pair) => pair.pixels[i] === null)) unavailableSeconds += duration;
  });

  return { id: target.id, seconds, unavailableSeconds };
}

export function summarizeVisibility(input: VisibilitySummaryInput): StudyVisibilityResult {
  const pairs = input.cameras.flatMap((_, index) => input.targets.map((target) => pairFor(input, index, target)));
  const targets = input.targets.map((target) => unionTarget(input, pairs, target));
  const available = targets.length > 0 && targets.every((target) => target.unavailableSeconds === 0);
  const duration = input.end - input.times[0];

  return {
    key: input.key,
    width: input.width,
    height: input.height,
    times: input.times,
    end: input.end,
    pairs,
    targets,
    ...(available && duration > 0
      ? { coverage: targets.reduce((sum, target) => sum + target.seconds, 0) / (duration * targets.length) }
      : {}),
  };
}
