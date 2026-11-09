import type { ServoFit } from '../data/components';

export const SERVO_PARAMS = ['gain', 'delay', 'damping', 'armature', 'friction', 'loadFriction', 'force'] as const;

export type ServoParam = (typeof SERVO_PARAMS)[number];

export type ServoScales = Partial<Record<ServoParam, number>>;

export const SCALE_LIMIT = Math.log(4);

export const scaleBounds = (name: ServoParam): [number, number] =>
  name === 'delay' ? [-SCALE_LIMIT, Math.log(8)] : [-SCALE_LIMIT, SCALE_LIMIT];

const factor = (scales: ServoScales, key: ServoParam) => Math.exp(scales[key] ?? 0);

export function scaledFit(preset: ServoFit, scales: ServoScales): ServoFit {
  const gain = factor(scales, 'gain');
  const damping = factor(scales, 'damping');
  const force = factor(scales, 'force');

  return {
    ...preset,
    kt: (preset.kt * damping) / force,
    resistance: (preset.resistance * damping) / force ** 2,
    errorGain: (preset.errorGain * gain) / force,
    armature: preset.armature * factor(scales, 'armature'),
    delayS: preset.delayS * factor(scales, 'delay'),
    friction: {
      ...preset.friction,
      base: preset.friction.base * factor(scales, 'friction'),
      loadExternal: preset.friction.loadExternal * factor(scales, 'loadFriction'),
      viscous: preset.friction.viscous * damping,
    },
  };
}

export const scalesOf = (names: readonly ServoParam[], x: ArrayLike<number>): ServoScales =>
  Object.fromEntries(names.map((name, i) => [name, x[i]]));

export const multipliers = (scales: ServoScales): Record<string, number> =>
  Object.fromEntries(Object.entries(scales).map(([k, v]) => [k, Math.exp(v ?? 0)]));
