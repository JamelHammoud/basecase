import type { MateType, Port, PortKind } from '../types/ports';
import { plural } from '../../electron/plural.mjs';

const BORE_TIGHT_MM = 0.3;
const BORE_SLACK_MM = 1.5;
const HOLE_MM = 1;
const PITCH_MM = 0.3;

const PAIRS: Record<string, MateType> = {
  'hole_circle+hole_circle': 'fastened',
  'screw+screw': 'fastened',
  'bore+screw': 'fastened',
  'bore+bore': 'fastened',
  'bore+output': 'coaxial',
  'bore+boss': 'coaxial',
  'face+face': 'face',
};

const ROUND: PortKind[] = ['output', 'boss'];
const HOLES: PortKind[] = ['screw', 'bore'];

const pairKey = (a: Port, b: Port) => [a.kind, b.kind].sort().join('+');

function circleProblem(a: Port, b: Port): string | null {
  if (a.count !== b.count) return `${plural(a.count ?? 0, 'hole')} against ${b.count}`;

  const off = Math.abs((a.pitchDiameterMm ?? 0) - (b.pitchDiameterMm ?? 0));

  return off > PITCH_MM ? `a Ø${a.pitchDiameterMm} hole circle against Ø${b.pitchDiameterMm}` : null;
}

function boreProblem(round: Port, bore: Port): string | null {
  if (!round.diameterMm || !bore.diameterMm) return null;

  const gap = bore.diameterMm - round.diameterMm;

  return gap < -BORE_TIGHT_MM || gap > BORE_SLACK_MM
    ? `a Ø${round.diameterMm} ${round.kind} in a Ø${bore.diameterMm} bore`
    : null;
}

function holeProblem(a: Port, b: Port): string | null {
  if (a.thread && b.thread) return null;

  if (!a.diameterMm || !b.diameterMm) return null;

  return Math.abs(a.diameterMm - b.diameterMm) > HOLE_MM ? `a Ø${a.diameterMm} hole against Ø${b.diameterMm}` : null;
}

export function fitProblem(a: Port, b: Port): string | null {
  if (a.thread && b.thread && a.thread !== b.thread) return `${a.thread} against ${b.thread}`;

  if (a.kind === 'hole_circle' && b.kind === 'hole_circle') return circleProblem(a, b);

  const round = [a, b].find((p) => ROUND.includes(p.kind));
  const bore = [a, b].find((p) => p.kind === 'bore');

  if (round && bore) return boreProblem(round, bore);

  return HOLES.includes(a.kind) && HOLES.includes(b.kind) ? holeProblem(a, b) : null;
}

export function mateTypeFor(a: Port, b: Port): MateType | null {
  const type = PAIRS[pairKey(a, b)];

  return type && !fitProblem(a, b) ? type : null;
}
