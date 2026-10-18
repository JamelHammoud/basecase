import type { PartDimensions, ScenePart } from '../../types/robotics';

export type DimensionKey = 'width' | 'height' | 'depth' | 'thickness';

export type ImageStance = 'up' | 'flat' | '';

export function wrapDegrees(a: number): number {
  const r = ((((a + 180) % 360) + 360) % 360) - 180;

  return r === -180 ? 180 : r;
}

export function resizedDimensions(
  dimensions: PartDimensions,
  key: DimensionKey,
  value: number,
  lockAspect: boolean,
): PartDimensions {
  const next = Math.max(1, value);

  if (!lockAspect || (key !== 'width' && key !== 'height')) return { ...dimensions, [key]: next };

  const ratio = dimensions.height / dimensions.width;
  const width = key === 'width' ? next : Math.round((next / ratio) * 10) / 10;
  const height = key === 'height' ? next : Math.round(next * ratio * 10) / 10;

  return { ...dimensions, width, height };
}

export function imageStance(rotation: ScenePart['rotation']): ImageStance {
  if (rotation[2] !== 0) return '';

  if (rotation[0] === 0) return 'up';

  return Math.abs(rotation[0]) === 90 ? 'flat' : '';
}
