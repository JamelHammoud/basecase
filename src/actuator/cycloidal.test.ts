import { describe, expect, it } from 'vitest';
import {
  cycloidalDesign,
  CYCLOIDAL_RATIOS,
  discProfile,
  holeClearance,
  meshedTurn,
  pinClearance,
  posedDisc,
  type P2,
} from './cycloidal';
import { motorById } from './motors';

const D6374 = motorById('odrive-d6374')!;

const crosses = (a: P2, b: P2, c: P2, d: P2) => {
  const side = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));

  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

function selfCrossings(poly: P2[]): number {
  let n = 0;

  for (let i = 0; i < poly.length; i++)
    for (let j = i + 2; j < poly.length - (i ? 0 : 1); j++)
      if (crosses(poly[i], poly[(i + 1) % poly.length], poly[j], poly[(j + 1) % poly.length])) n++;

  return n;
}

describe('cycloidal drive', () => {
  it('turns both discs through one output turn without touching a ring pin or an output pin', () => {
    const d = cycloidalDesign(15, D6374);
    const profile = discProfile(d, 24 * d.lobes);
    const inputs = Array.from({ length: 60 }, (_, i) => (2 * Math.PI * d.ratio * i) / 60);
    const pins = inputs.flatMap((t) => [0, 1].map((k) => pinClearance(d, profile, posedDisc(d, t, k as 0 | 1))));
    const holes = inputs.flatMap((t) => [holeClearance(d, t, 0), holeClearance(d, t, 1)]);

    expect(Math.min(...pins)).toBeGreaterThan(d.fit - 0.03);
    expect(Math.max(...pins)).toBeLessThan(d.fit + 0.03);
    expect(Math.min(...holes)).toBeGreaterThan(0.1);
  });

  it('builds every ratio as a disc whose edge never crosses itself', () => {
    for (const ratio of CYCLOIDAL_RATIOS) {
      const d = cycloidalDesign(ratio, D6374);

      expect(selfCrossings(discProfile(d, 24 * d.lobes)), `${ratio}:1`).toBe(0);
      expect(d.pinCircleR, `${ratio}:1 curtate`).toBeGreaterThan(d.ecc * d.pins);
    }
  });

  it('turns the output once per lobes ÷ (pins − lobes) input turns, measured from the disc that meshes', () => {
    const d = cycloidalDesign(15, D6374);
    const profile = discProfile(d, 24 * d.lobes);
    const pitch = (2 * Math.PI) / d.lobes;
    const input = (2 * Math.PI) / d.pins;
    const meshed = meshedTurn(d, profile, input, 600);
    const back = pitch - meshed;

    expect(d.pins).toBe(16);
    expect(input / back).toBeCloseTo(d.lobes / (d.pins - d.lobes), 0);
    expect(d.ratio).toBe(d.lobes / (d.pins - d.lobes));
  });
});
