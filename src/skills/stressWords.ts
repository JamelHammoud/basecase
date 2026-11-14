import { negative } from '../../electron/minus.mjs';
import { percent } from '../../electron/percent.mjs';
import { NOMINAL, STRESS_AXES, type StressAxis, type StressFinding, type StressPoint } from './stress';

const AXIS_NAMES: Record<StressAxis, string> = {
  friction: 'Friction',
  mass: 'Mass',
  strength: 'Strength',
  latencyMs: 'Delay',
};

const trimmed = (v: number) => String(Math.round(v * 100) / 100);

const FIGURES: Record<StressAxis, (v: number) => string> = {
  friction: (v) => `×${trimmed(v)}`,
  mass: (v) => `×${trimmed(v)}`,
  strength: (v) => percent(v, { down: true }),
  latencyMs: (v) => `${Math.round(v)} ms`,
};

export const axisValue = (axis: StressAxis, value: number) => FIGURES[axis](value);

const pointWords = (point: StressPoint) =>
  STRESS_AXES.filter((a) => point[a] !== NOMINAL[a])
    .map((a, i) => `${i ? AXIS_NAMES[a].toLowerCase() : AXIS_NAMES[a]} ${axisValue(a, point[a])}`)
    .join(', ');

export function findingLine(finding: StressFinding): string {
  const { axis, side, boundary } = finding;

  if (axis === 'combined' || boundary === null) return pointWords(finding.point);

  return `${AXIS_NAMES[axis]} ${side === 'below' ? '<' : '>'} ${axisValue(axis, boundary)}`;
}

export const stressMarginText = (margin: number) => negative(margin, (v) => v.toFixed(2));

export const findingText = (finding: StressFinding) =>
  `${findingLine(finding)}: margin ${stressMarginText(finding.margin)} at ${pointWords(finding.point) || 'the nominal physics'}`;
