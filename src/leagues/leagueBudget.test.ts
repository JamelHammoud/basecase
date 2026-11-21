import { describe, expect, it } from 'vitest';
import { galleryBundles } from '../gallery/galleryEntries';
import type { MeshMeasure } from '../three/meshMeasure';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { leagueBudget } from './leagueBudget';

const bundle = galleryBundles()[1];
const manifest = { deadline: '2026-11-15T00:00:00.000Z' };
const measured: MeshMeasure = {
  volumeMm3: 1000,
  areaMm2: 600,
  min: [0, 0, 0],
  max: [10, 10, 10],
  centroid: [5, 5, 5],
  triangles: 12,
};
const printed = { ...bundle.robot.parts[0], id: 'printed-body', kind: 'cad_part' as const };
const servo = {
  ...bundle.robot.parts[0],
  id: 'catalog-servo',
  kind: 'component' as const,
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
};
const withParts = (parts: typeof bundle.robot.parts) => ({ ...bundle, robot: { ...bundle.robot, parts, joints: [] } });

describe('League Budget uses reproducible complete catalog and geometry measurements', () => {
  it('reuses the BOM estimate without entrant prices or owned stock', () => {
    const value = withParts([printed]);
    const measures = { [printed.id]: measured };
    const bom = buildBom({
      parts: value.robot.parts,
      project: { ...DEFAULT_PROJECT, joints: [] },
      purchases: {},
      measures,
      now: new Date(manifest.deadline),
    });

    expect(leagueBudget(value, measures, manifest)).toBe(bom.totals.estimatedUsd);
    expect(leagueBudget(value, measures, manifest)).toBeGreaterThan(0);
  });

  it('keeps missing geometry, missing prices and unknown catalog items unmeasured', () => {
    expect(leagueBudget(withParts([printed]), {}, manifest)).toBeNull();
    expect(leagueBudget(withParts([servo]), {}, manifest)).toBeNull();
    expect(leagueBudget(withParts([{ ...servo, componentId: 'not-in-the-catalog' }]), {}, manifest)).toBeNull();
    expect(leagueBudget(withParts([{ ...printed, kind: 'servo' }]), {}, manifest)).toBeNull();
  });

  it('refuses nonfinite or negative measurements instead of silently pricing them at zero', () => {
    for (const volumeMm3 of [NaN, Infinity, -1, 0]) {
      expect(leagueBudget(withParts([printed]), { [printed.id]: { ...measured, volumeMm3 } }, manifest)).toBeNull();
    }
  });

  it('counts hidden solid parts, while an empty robot has no measured Budget', () => {
    const visible = withParts([servo]);
    const hidden = withParts([{ ...servo, visible: false }]);

    expect(leagueBudget(hidden, {}, manifest)).toBe(leagueBudget(visible, {}, manifest));
    expect(leagueBudget(withParts([]), {}, manifest)).toBeNull();
  });
});
