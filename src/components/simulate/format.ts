import type { Controller } from '../../sim/engine';

export const fmtTime = (t: number) => `${t.toFixed(1)} s`;

export const pct = (u: number) => `${Math.round(Math.min(u, 1) * 100)}%`;

export const fmtSteps = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;

  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;

  return String(n);
};

export const controllerValue = (controller: Controller, policyKey: string | null): string => {
  if (controller.kind === 'policy') return policyKey ? `policy:${policyKey}` : '';

  return controller.kind === 'animation' ? `anim:${controller.animation.id}` : controller.kind;
};

export const rewardPath = (curve: number[]): string => {
  if (curve.length < 2) return '';

  const lo = Math.min(...curve),
    hi = Math.max(...curve);
  const span = hi - lo || 1;

  return curve
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i / (curve.length - 1)) * 100).toFixed(2)},${(36 - ((v - lo) / span) * 32 - 2).toFixed(2)}`,
    )
    .join(' ');
};
