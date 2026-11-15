import type { TryFrameSelection } from '../vision/tryFramesTypes';

export interface FrameLabelOptions {
  frame: number;
  from: number;
  to: number;
  step: number;
  count: number;
}

export function frameLabelSelection(kind: TryFrameSelection['kind'], options: FrameLabelOptions): TryFrameSelection {
  if (kind === 'frame') return { kind, frame: options.frame };

  if (kind === 'sample') return { kind, count: options.count };

  if (kind === 'every') return { kind, step: options.step };

  return { kind, from: options.from, to: options.to, step: options.step };
}

export const toggleFrameCamera = (values: string[], key: string) =>
  values.includes(key) ? values.filter((value) => value !== key) : [...values, key];
