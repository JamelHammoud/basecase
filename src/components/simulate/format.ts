import type { Controller } from '../../sim/engine';

export const fmtTime = (t: number) => `${t.toFixed(1)} s`;

export const fmtMargin = (m: number) => `${m < 0 ? '−' : '+'}${Math.abs(m).toFixed(2)}`;

export const pct = (u: number) => `${Math.round(Math.min(u, 1) * 100)}%`;

export const trainingLine = (message: string, share: number | null): string => {
  if (share !== null) return `${message} ${pct(share)}`;

  return /[.!?…]$/.test(message) ? message : `${message}…`;
};

export const fmtSteps = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;

  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;

  return String(n);
};

export const controllerValue = (controller: Controller, policyKey: string | null): string => {
  if (controller.kind === 'policy') return policyKey ? `policy:${policyKey}` : '';

  return controller.kind === 'animation' ? `anim:${controller.animation.id}` : controller.kind;
};
