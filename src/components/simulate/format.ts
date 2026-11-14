import type { Controller } from '../../sim/engine';
import { signed } from '../../../electron/minus.mjs';
import { percent } from '../../../electron/percent.mjs';

const hundredths = (v: number) => v.toFixed(2);

export const fmtMargin = (m: number) => signed(m, hundredths);

export const trainingLine = (message: string, share: number | null): string => {
  if (share !== null) return `${message} ${percent(Math.min(share, 1))}`;

  return /[.!?…]$/.test(message) ? message : `${message}…`;
};

export const controllerValue = (controller: Controller, policyKey: string | null): string => {
  if (controller.kind === 'policy') return policyKey ? `policy:${policyKey}` : '';

  return controller.kind === 'animation' ? `anim:${controller.animation.id}` : controller.kind;
};
