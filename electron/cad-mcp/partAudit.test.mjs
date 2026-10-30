import { describe, expect, it } from 'vitest';
import { craftReport } from './craftReport.mjs';
import { resolveExpect } from './expectations.mjs';
import { revisionLines } from './partAudit.mjs';

const audit = (over) => ({ bodies: 1, genus: 0, hullVolume: 1_000_000, ...over });

describe('revision diff', () => {
  it('accepts hollowing that keeps the outline', () => {
    const lines = revisionLines(
      { exists: true, volume: 1_155_000, audit: audit() },
      audit({ hullVolume: 990_000 }),
      74_000,
    );

    expect(lines).toEqual([
      'Since the last revision: volume 1155k → 74k mm³ (-94%), hull 1000k → 990k mm³, bodies 1 → 1.',
    ]);
  });

  it('warns when the outline collapses or the part falls apart', () => {
    const lines = revisionLines(
      { exists: true, volume: 75_000, audit: audit() },
      audit({ hullVolume: 300_000, bodies: 3 }),
      33_000,
    );

    expect(lines[1]).toMatch(/^Warning: the outline collapsed \(convex hull down to 30%/);
    expect(lines[2]).toMatch(/fell apart/);
  });
});

describe('frozen requirements', () => {
  const first = { holes: [{ count: 4, d: 3.4, axis: 'z', through: true }], min_wall_mm: 1.2 };

  it('keeps them when a later call leaves expect out', () => {
    expect(resolveExpect(undefined, first)).toEqual({ expect: first, changes: [] });
  });

  it('reports a change and what was dropped', () => {
    const { expect: next, changes } = resolveExpect({ holes: [{ count: 2, d: 3.4, axis: 'z', through: true }] }, first);

    expect(next.min_wall_mm).toBeUndefined();
    expect(changes[0]).toContain('holes [{"count":4');
    expect(changes[0]).toContain('Dropped: min_wall_mm.');
  });
});

describe('craft review', () => {
  const part = (id, share, craft, extra = {}) => ({
    id,
    name: id,
    share,
    printed: true,
    size: [40, 40, 40],
    craft,
    ...extra,
  });
  const craft = (over) => ({
    envelopeSharp: 0.4,
    dominantRadius: 3,
    dominantShare: 0.6,
    radii: [3],
    solidity: 0.3,
    thicknessMm: 3,
    walls: { modalMm: 2.4, consistent: 0.9 },
    ...over,
  });

  it('weights sharpness by visible surface and names the parts worth rounding', () => {
    const rows = craftReport([
      part('shell', 0.6, craft({ envelopeSharp: 0.9 })),
      part('bracket', 0.05, craft({ envelopeSharp: 0.1 })),
      part('brick', 0.1, craft({ solidity: 0.95, thicknessMm: 12 })),
      ...['M2', 'M2.5', 'M3', 'M4'].map((size, i) =>
        part(`screw-${i}`, 0.001, null, { hardware: { type: 'socket_head', size } }),
      ),
    ]);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    expect(byName['Envelope sharpness'].detail).toMatch(/^0\.78 weighted/);
    expect(byName['Envelope sharpness'].items[0]).toContain('shell (60% of the visible surface, 0.9)');
    expect(byName['Printed bricks'].items).toHaveLength(1);
    expect(byName['Fastener vocabulary'].status).toBe('WARN');
    expect(byName['Exposed heads'].detail).toMatch(/^4 screw heads/);
    expect(craftReport([part('shell', 0.6, craft({ envelopeSharp: 0.9 }))], { faceted: true })[0].status).toBe('OK');
  });
});
