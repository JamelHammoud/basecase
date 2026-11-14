import { describe, expect, it } from 'vitest';
import { cycloidalSpec } from '../data/generatedActuators';
import { designRatio, PIN_COUNTS, sizedDesign, type CycloidalDesign } from './cycloidal';

type P2 = [number, number];

const CLEARANCE = 0.15;
const SAMPLES = 144;
const rad = (deg: number) => (deg * Math.PI) / 180;

function profile(d: CycloidalDesign): P2[] {
  const r = d.pinD / 2 + CLEARANCE;
  const k = d.pins - d.lobes;
  const steps = 24 * d.pins;

  return Array.from({ length: steps }, (_, i) => {
    const t = (2 * Math.PI * i) / steps;
    const psi = Math.atan2(Math.sin((k - d.pins) * t), d.R / (d.e * d.pins) - Math.cos((k - d.pins) * t));

    return [
      d.R * Math.cos(t) - r * Math.cos(t + psi) - d.e * Math.cos(d.pins * t),
      -d.R * Math.sin(t) + r * Math.sin(t + psi) + d.e * Math.sin(d.pins * t),
    ];
  });
}

function segmentDistance([px, py]: P2, [ax, ay]: P2, [bx, by]: P2): number {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inside([px, py]: P2, poly: P2[]): boolean {
  let hit = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [poly[i], poly[j]];

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }

  return hit;
}

function signedGap(pin: P2, poly: P2[], pinR: number): number {
  const d = Math.min(...poly.map((a, i) => segmentDistance(pin, a, poly[(i + 1) % poly.length])));

  return (inside(pin, poly) ? -d : d) - pinR;
}

interface Pose {
  turnDeg: number;
  ratio: number;
}

function smallestGap(d: CycloidalDesign, disc: P2[], { turnDeg, ratio }: Pose, phaseDeg: number): number {
  const centre = rad(turnDeg + phaseDeg);
  const spin = phaseDeg ? rad(180 / d.lobes) : 0;
  const placed = disc.map(([x, y]): P2 => [
    d.e * Math.cos(centre) + x * Math.cos(spin) - y * Math.sin(spin),
    d.e * Math.sin(centre) + x * Math.sin(spin) + y * Math.cos(spin),
  ]);
  const ring = rad(turnDeg / ratio);
  const pins = Array.from({ length: d.pins }, (_, i): P2 => {
    const a = (2 * Math.PI * i) / d.pins + ring;

    return [d.R * Math.cos(a), d.R * Math.sin(a)];
  });

  return Math.min(...pins.map((p) => signedGap(p, placed, d.pinD / 2)));
}

function gapThroughOneOutputTurn(d: CycloidalDesign, ratio: number): number {
  const disc = profile(d);
  const outputTurn = 360 * designRatio(d);
  const poses = Array.from({ length: SAMPLES }, (_, i) => ({ turnDeg: (outputTurn * i) / SAMPLES + 0.7, ratio }));

  return Math.min(...poses.flatMap((pose) => [smallestGap(d, disc, pose, 0), smallestGap(d, disc, pose, 180)]));
}

const designs = PIN_COUNTS.map((pins) =>
  sizedDesign('odrive-d6374', pins, cycloidalSpec('odrive-d6374', pins)!.stallNm),
);

describe('cycloidal discs', () => {
  it.each(designs.map((d) => [`${d.pins} pins`, d] as const))(
    'clear every output pin through one output turn with %s',
    (_, d) => {
      expect(gapThroughOneOutputTurn(d, designRatio(d))).toBeGreaterThan(0.05);
    },
  );

  it('hit the pins when the ring turns at one less than pins ÷ (pins − lobes)', () => {
    const d = designs[2];

    expect(gapThroughOneOutputTurn(d, designRatio(d) - 1)).toBeLessThan(-1);
  });
});
