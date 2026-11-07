import type { ArenaVariantResult } from './artifacts';

const BISECTION_STEPS = 80;

function logChoose(n: number, k: number): number {
  let sum = 0;

  for (let i = 1; i <= k; i++) sum += Math.log(n - k + i) - Math.log(i);

  return sum;
}

export function binomialTailAtLeast(successes: number, trials: number, p: number): number {
  if (successes <= 0) return 1;

  if (p <= 0) return 0;

  if (p >= 1) return 1;

  let total = 0;

  for (let k = successes; k <= trials; k++) {
    total += Math.exp(logChoose(trials, k) + k * Math.log(p) + (trials - k) * Math.log1p(-p));
  }

  return Math.min(1, total);
}

export function clopperPearsonLower(successes: number, trials: number, confidence: number): number {
  if (!Number.isInteger(trials) || trials <= 0 || successes < 0 || successes > trials) {
    throw new Error('Clopper-Pearson needs 0 ≤ successes ≤ trials and at least one trial.');
  }

  if (successes === 0) return 0;

  const alpha = 1 - confidence;
  let low = 0;
  let high = 1;

  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (low + high) / 2;

    if (binomialTailAtLeast(successes, trials, mid) < alpha) low = mid;
    else high = mid;
  }

  return low;
}

const VARIANT_WORDS: Record<ArenaVariantResult['variant'], string> = {
  'held-out': 'with held-out random starts and physics',
  'half-timestep': 'at half the physics timestep',
  latency: 'with random servo delays',
};

const percent = (p: number) => `${Math.floor(p * 100)}%`;

export function arenaSummary(options: {
  variants: ArenaVariantResult[];
  lowerBound: number;
  confidence: number;
}): string {
  const { variants, lowerBound, confidence } = options;
  const tries = variants.map((v) => `${v.passes} of ${v.trials} ${VARIANT_WORDS[v.variant]}`).join(', ');

  return [
    `Passed ${tries}, in simulation.`,
    `With ${percent(confidence)} confidence, the pass rate under these conditions is at least ${percent(lowerBound)}.`,
    'Tried in simulation only: this says nothing about real hardware.',
  ].join(' ');
}
