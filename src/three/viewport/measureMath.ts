import type { MeasureUnit } from '../../types/robotics';
import type { Vec3 } from './types';

export type SnapKind = 'vertex' | 'edge' | 'surface';

export interface Snap {
  point: Vec3;
  kind: SnapKind;
}

const VERTEX_REACH = 1.5;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const at = (segments: ArrayLike<number>, i: number): Vec3 => [segments[i], segments[i + 1], segments[i + 2]];

function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const lengthSq = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const raw = lengthSq > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / lengthSq : 0;
  const t = Math.min(1, Math.max(0, raw));

  return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
}

function nearestVertex(hit: Vec3, segments: ArrayLike<number>, reach: number): Vec3 | null {
  let best: Vec3 | null = null;
  let bestDistance = reach;

  for (let i = 0; i + 2 < segments.length; i += 3) {
    const v = at(segments, i);
    const d = distance(hit, v);

    if (d <= bestDistance) {
      best = v;
      bestDistance = d;
    }
  }

  return best;
}

function nearestEdgePoint(hit: Vec3, segments: ArrayLike<number>, reach: number): Vec3 | null {
  let best: Vec3 | null = null;
  let bestDistance = reach;

  for (let i = 0; i + 5 < segments.length; i += 6) {
    const p = closestOnSegment(hit, at(segments, i), at(segments, i + 3));
    const d = distance(hit, p);

    if (d <= bestDistance) {
      best = p;
      bestDistance = d;
    }
  }

  return best;
}

export function snapPoint(hit: Vec3, segments: ArrayLike<number>, reach: number): Snap {
  const vertex = nearestVertex(hit, segments, reach * VERTEX_REACH);

  if (vertex) return { point: vertex, kind: 'vertex' };

  const edge = nearestEdgePoint(hit, segments, reach);

  return edge ? { point: edge, kind: 'edge' } : { point: hit, kind: 'surface' };
}

export interface LengthPart {
  value: string;
  unit: string;
}

const MM_PER_INCH = 25.4;
const SIXTEENTHS = 16;
const FRACTIONS: Record<number, string> = {
  1: '¹⁄₁₆',
  2: '⅛',
  3: '³⁄₁₆',
  4: '¼',
  5: '⁵⁄₁₆',
  6: '⅜',
  7: '⁷⁄₁₆',
  8: '½',
  9: '⁹⁄₁₆',
  10: '⅝',
  11: '¹¹⁄₁₆',
  12: '¾',
  13: '¹³⁄₁₆',
  14: '⅞',
  15: '¹⁵⁄₁₆',
};

const trimmed = (value: number, digits: number) => String(Number(value.toFixed(digits)));

function metricLength(mm: number): LengthPart[] {
  const rounded = Math.round(mm * 10) / 10;

  if (rounded < 1000) return [{ value: trimmed(rounded, 1), unit: 'mm' }];

  return [{ value: trimmed(mm / 1000, 3), unit: 'm' }];
}

function inchesText(sixteenths: number): string {
  const whole = Math.floor(sixteenths / SIXTEENTHS);
  const fraction = FRACTIONS[sixteenths % SIXTEENTHS];

  if (!fraction) return String(whole);

  return whole ? `${whole} ${fraction}` : fraction;
}

function imperialLength(mm: number): LengthPart[] {
  const inches = mm / MM_PER_INCH;
  const sixteenths = Math.round(inches * SIXTEENTHS);

  if (sixteenths === 0) return [{ value: trimmed(inches, 3), unit: 'in' }];

  const perFoot = 12 * SIXTEENTHS;
  const feet = Math.floor(sixteenths / perFoot);
  const rest = sixteenths % perFoot;

  if (!feet) return [{ value: inchesText(rest), unit: 'in' }];

  return rest
    ? [
        { value: String(feet), unit: 'ft' },
        { value: inchesText(rest), unit: 'in' },
      ]
    : [{ value: String(feet), unit: 'ft' }];
}

export function formatLength(mm: number, unit: MeasureUnit): LengthPart[] {
  return unit === 'imperial' ? imperialLength(mm) : metricLength(mm);
}

export function closestOnVertical(a: Vec3, origin: Vec3, direction: Vec3): Vec3 {
  const toLine: Vec3 = [a[0] - origin[0], a[1] - origin[1], a[2] - origin[2]];
  const along = direction[1];
  const denominator = 1 - along * along;

  if (denominator < 1e-6) return a;

  const reach = direction[0] * toLine[0] + direction[1] * toLine[1] + direction[2] * toLine[2];
  const rise = (along * reach - toLine[1]) / denominator;

  return [a[0], a[1] + rise, a[2]];
}

export const measureDistance = distance;

export interface FeetInches {
  feet: number;
  inches: number;
}

export function toFeetInches(mm: number): FeetInches {
  const total = Math.round((mm / MM_PER_INCH) * 10) / 10;
  const feet = Math.floor(total / 12);

  return { feet, inches: Math.round((total - feet * 12) * 10) / 10 };
}

export const fromFeetInches = ({ feet, inches }: FeetInches) => (feet * 12 + inches) * MM_PER_INCH;
