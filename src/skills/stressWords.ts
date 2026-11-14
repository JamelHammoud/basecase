import { NOMINAL_PHYSICS, type PhysicsScales } from '../sim/physicsScales';
import {
  STRESS_AXES,
  STRESS_LIMITS,
  type AxisReport,
  type StressAxis,
  type StressFinding,
  type StressResult,
} from './stress';

const NAMES: Record<StressAxis, string> = {
  friction: 'friction',
  mass: 'weight',
  strength: 'strength',
  latencyMs: 'latency',
};

const VALUES: Record<StressAxis, (v: number) => string> = {
  friction: (v) => v.toFixed(2),
  mass: (v) => `×${v.toFixed(2)}`,
  strength: (v) => `${Math.round(v * 100)}%`,
  latencyMs: (v) => `${Math.round(v)} ms`,
};

const MOVED = 0.02;

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const span = (axis: StressAxis) => STRESS_LIMITS[axis][1] - STRESS_LIMITS[axis][0];

export const axisValue = (axis: StressAxis, value: number) => VALUES[axis](value);

export const movedAxes = (point: PhysicsScales) =>
  STRESS_AXES.filter((axis) => Math.abs(point[axis] - NOMINAL_PHYSICS[axis]) / span(axis) > MOVED);

const pointWords = (point: PhysicsScales, axes: readonly StressAxis[]) =>
  axes.map((axis) => `${NAMES[axis]} ${axisValue(axis, point[axis])}`).join(', ');

export function findingWords(finding: StressFinding): string {
  const { axis, point } = finding;

  if (axis === 'combined') return capitalized(pointWords(point, movedAxes(point)));

  const sign = finding.side === 'below' ? '<' : '>';

  return `${capitalized(NAMES[axis])} ${sign} ${axisValue(axis, finding.boundary ?? point[axis])}`;
}

const signed = (margin: number) => `${margin < 0 ? '−' : '+'}${Math.abs(margin).toFixed(2)}`;

const verdict = (margin: number) => (margin > 0 ? 'it passes there' : 'it fails there');

const limitsOf = (axis: StressAxis) =>
  `${axisValue(axis, STRESS_LIMITS[axis][0])} to ${axisValue(axis, STRESS_LIMITS[axis][1])}`;

function axisLine(report: AxisReport): string {
  const { axis, boundary, side } = report;
  const name = capitalized(NAMES[axis]);

  if (boundary === null) return `- ${name}: held from ${limitsOf(axis)}.`;

  return `- ${name}: fails ${side === 'below' ? 'below' : 'above'} ${axisValue(axis, boundary)} (tested ${limitsOf(axis)}).`;
}

export function stressReport(label: string, result: StressResult): string {
  const { nominal, worst } = result;

  return [
    `Stressed ${label} with ${result.rollouts} of ${result.budget} rollouts, seed ${result.seed}.`,
    `Normal physics: margin ${signed(nominal.margin)}, ${verdict(nominal.margin)}.`,
    'Each condition alone:',
    ...result.axes.map(axisLine),
    `Worst combination found: ${pointWords(worst.point, STRESS_AXES)}; margin ${signed(worst.margin)}, ${verdict(worst.margin)}.`,
    'A positive margin passes the skill’s contract and a negative one fails it. Friction, weight and strength are multiples of the robot’s own; latency is servo delay added on top.',
  ].join('\n');
}
