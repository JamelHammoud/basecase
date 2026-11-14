import { percent } from '../../electron/percent.mjs';
import { STRESS_LIMITS, type StressAxis, type StressFinding, type StressResult } from './stress';
import { plural } from '../../electron/plural.mjs';

const AXIS: Record<StressAxis, string> = {
  friction: 'Friction',
  mass: 'Weight',
  strength: 'Strength',
  latencyMs: 'Delay',
};

export function axisValue(axis: StressAxis, v: number): string {
  if (axis === 'strength') return percent(v);

  if (axis === 'latencyMs') return `${Math.round(v)} ms`;

  return `×${v.toFixed(2)}`;
}

export const findingLabel = (f: StressFinding) =>
  `${AXIS[f.axis]} ${f.side === 'below' ? '<' : '>'} ${axisValue(f.axis, f.boundary)}`;

const signed = (m: number) => `${m < 0 ? '−' : ''}${Math.abs(m).toFixed(2)}`;

export function stressLines(result: StressResult): string[] {
  const { worst } = result;
  const conditions = (Object.keys(AXIS) as StressAxis[])
    .map((a) => `${AXIS[a].toLowerCase()} ${axisValue(a, worst.replay[a])}`)
    .join(', ');
  const findings = result.findings.map(
    (f) => `- ${findingLabel(f)}: fails past it, margin ${signed(f.margin)} at ${axisValue(f.axis, f.replay[f.axis])}`,
  );
  const limits = (Object.keys(AXIS) as StressAxis[])
    .map((a) => `${AXIS[a].toLowerCase()} ${axisValue(a, STRESS_LIMITS[a][0])} to ${axisValue(a, STRESS_LIMITS[a][1])}`)
    .join(', ');

  return [
    ...(findings.length
      ? ['Where it fails, one condition at a time:', ...findings]
      : ['It passes everywhere in the limits, one condition at a time.']),
    `Worst combination: ${conditions}, margin ${signed(worst.margin)}.`,
    `Searched ${limits}: ${plural(result.rollouts, 'run')}, each judged by the skill’s contract.`,
  ];
}
