import type { SheetProfile } from '../types/sheet';
import { detectSheet } from './detectSheet';
import { DRAWING_LIMITS, type DrawingHole, type DrawingPoint } from './drawingTypes';

function circleBasis(loop: DrawingPoint[]) {
  const a = loop[0];
  const b = loop.reduce((best, p) => (distance(a, p) > distance(a, best) ? p : best), a);
  const cross = (p: DrawingPoint) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const c = loop.reduce((best, p) => (Math.abs(cross(p)) > Math.abs(cross(best)) ? p : best), a);
  const denominator = 2 * cross(c);

  if (Math.abs(denominator) < 1e-8) return null;

  const squared = (p: DrawingPoint) => p[0] ** 2 + p[1] ** 2;
  const ab = squared(b) - squared(a);
  const ac = squared(c) - squared(a);
  const center: DrawingPoint = [
    (ab * (c[1] - a[1]) - ac * (b[1] - a[1])) / denominator,
    ((b[0] - a[0]) * ac - (c[0] - a[0]) * ab) / denominator,
  ];

  return { center, radius: distance(center, a) };
}

const distance = (a: DrawingPoint, b: DrawingPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function measuredHole(loop: DrawingPoint[]): DrawingHole | null {
  if (loop.length < 12) return null;

  const basis = circleBasis(loop);

  if (!basis || basis.radius <= DRAWING_LIMITS.toleranceMm) return null;

  const { center, radius } = basis;
  let residualMm = 0;
  let chordErrorMm = 0;
  let sweep = 0;
  let maximumAngle = 0;

  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    const midpoint: DrawingPoint = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

    const angle = Math.atan2(
      (p[0] - center[0]) * (q[1] - center[1]) - (p[1] - center[1]) * (q[0] - center[0]),
      (p[0] - center[0]) * (q[0] - center[0]) + (p[1] - center[1]) * (q[1] - center[1]),
    );

    sweep += angle;
    maximumAngle = Math.max(maximumAngle, Math.abs(angle));
    residualMm = Math.max(residualMm, Math.abs(distance(center, p) - radius));
    chordErrorMm = Math.max(chordErrorMm, Math.abs(radius - distance(center, midpoint)));
  }

  if (
    residualMm > DRAWING_LIMITS.toleranceMm ||
    chordErrorMm > DRAWING_LIMITS.chordMm ||
    maximumAngle > Math.PI / 6 + 1e-5 ||
    Math.abs(Math.abs(sweep) - Math.PI * 2) > 1e-5
  )
    return null;

  return { center, diameterMm: radius * 2, approximate: true, residualMm, chordErrorMm };
}

function parallelProfile(profile: SheetProfile | undefined): profile is SheetProfile {
  return !!profile && Math.abs(profile.normal[2]) > 1 - 1e-6;
}

export function drawingFeatures(triangles: Float32Array) {
  const profile = detectSheet(triangles);

  if (!parallelProfile(profile)) return { mode: 'outline-only' as const, holes: [] };

  const holes = profile.holes.flatMap((loop) => {
    const measured = measuredHole(loop);

    return measured ? [measured] : [];
  });

  const edges = profile.outline.map((a, index) => {
    const b = profile.outline[(index + 1) % profile.outline.length];

    return { a, b, lengthMm: distance(a, b) };
  });

  if (holes.length * 3 + edges.length + 3 > DRAWING_LIMITS.dimensions)
    throw new Error('Reduce the drawing to at most 128 dimensions per sheet.');

  return {
    mode: 'profile' as const,
    thicknessMm: profile.thicknessMm,
    holes,
    edges,
    omittedHoleDimensions: profile.holes.length - holes.length,
  };
}
