import { sampleAnimation } from '../utils/animation';
import type { Controller } from './engine';

export function controlValues(c: Controller, time: number): Record<string, number> | undefined {
  if (c.kind === 'hold') return c.values;

  if (c.kind === 'animation') return sampleAnimation(c.animation, time).values;

  return c.kind === 'policy' ? c.hold : undefined;
}
