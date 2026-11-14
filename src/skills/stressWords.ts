import { negative } from '../../electron/minus.mjs';
import { percent } from '../../electron/percent.mjs';
import { STRESS_LIMITS, type StressAxisResult, type StressResult } from './stress';
import type { StressAxis, StressRun } from './stressProbe';

export const STRESS_LABELS: Record<StressAxis, string> = {
  friction: 'Friction',
  mass: 'Link mass',
  strength: 'Servo strength',
  latencyMs: 'Servo delay',
};

const times = (v: number) => `×${v.toFixed(2)}`;

const SHOWN: Record<StressAxis, (v: number) => string> = {
  friction: times,
  mass: times,
  strength: (v) => percent(v),
  latencyMs: (v) => `${Math.round(v)} ms`,
};

export const axisFigure = (axis: StressAxis, value: number) => SHOWN[axis](value);

export const marginFigure = (margin: number) => negative(margin, (v) => v.toFixed(2));

export function findingLine(finding: StressAxisResult): string {
  const sign = finding.side === 'below' ? '<' : '>';
  const at = finding.boundary ?? finding.run[finding.axis];

  return `${STRESS_LABELS[finding.axis]} ${sign} ${axisFigure(finding.axis, at)}, margin ${marginFigure(finding.margin)}`;
}

export const runWords = (run: StressRun) =>
  (Object.keys(STRESS_LABELS) as StressAxis[]).map((a) => `${STRESS_LABELS[a]} ${axisFigure(a, run[a])}`).join(', ');

const range = (axis: StressAxis, [lo, hi]: readonly [number, number]) =>
  `${axisFigure(axis, lo)} to ${axisFigure(axis, hi)}`;

function axisText(result: StressAxisResult): string {
  const at = axisFigure(result.axis, result.run[result.axis]);
  const label = STRESS_LABELS[result.axis];

  if (result.boundary === null)
    return `- ${label}: passes the whole range (lowest margin ${marginFigure(result.margin)} at ${at}).`;

  return `- ${label}: fails ${result.side} ${axisFigure(result.axis, result.boundary)} (margin ${marginFigure(result.margin)} at ${at}).`;
}

export function stressText(name: string, result: StressResult): string {
  const limits = (Object.keys(STRESS_LABELS) as StressAxis[]).map(
    (a) => `${STRESS_LABELS[a].toLowerCase()} ${range(a, STRESS_LIMITS[a])}`,
  );

  return [
    `Stressed ${name} in ${result.rollouts} runs from one start pose, one axis at a time and then all together, over ${limits.join(', ')}. Margin is the contract's: above 0 passes.`,
    `At nominal physics the margin is ${marginFigure(result.nominal)}.`,
    ...result.axes.map(axisText),
    `Worst combination: ${runWords(result.worst.run)}, margin ${marginFigure(result.worst.margin)}.`,
  ].join('\n');
}
