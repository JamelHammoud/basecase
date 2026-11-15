import { describe, expect, it } from 'vitest';
import { joint } from '../sim/fixtures/parts';
import { component, sceneOf } from './fixtures';
import { analyzeWiring } from './routeAnalysis';
import { buildBom } from '../utils/bom';
import type { WiringScene } from './connectors';

function elbow(range: [number, number]): WiringScene {
  const adapter = component('adapter', 'waveshare-bus-servo-adapter-a');
  const servo = { ...component('servo', 'feetech-sts3215', 'c001'), position: [50, 0, 0] as [number, number, number] };
  const hinge = joint({
    id: 'elbow',
    link: ['adapter', 'servo'],
    origin: [200, 0, 0],
    axis: [0, 0, 1],
    effortNm: 1,
    range,
  });

  return sceneOf([adapter, servo], [hinge]);
}

describe('maker cable stock over elbow travel', () => {
  it('changes from the 300 mm to the 900 mm Waveshare cable when full extension is enabled', () => {
    const folded = analyzeWiring(elbow([0, 0]), []);
    const scene = elbow([0, 180]);
    const extended = analyzeWiring(scene, []);
    const before = folded.buses[0].nets[0].route!;
    const after = extended.buses[0].nets[0].route!;

    expect(before).toMatchObject({ status: 'pass', cableSupplyId: 'waveshare-servo-cable-5264-300', lengthMm: 300 });
    expect(after).toMatchObject({ status: 'pass', cableSupplyId: 'waveshare-servo-cable-5264-900', lengthMm: 900 });
    expect(after.requiredMm).toBeGreaterThan(300);
    expect(after.limitingPose.elbow).toBeDefined();

    const bom = buildBom({ ...scene, wiring: extended, purchases: {}, measures: {} });

    expect(bom.lines.find((line) => line.key === 'supply:waveshare-servo-cable-5264-900')).toMatchObject({
      qty: 1,
      packs: 1,
      estUsd: 3.99,
    });
    expect(bom.lines.some((line) => line.key === 'supply:servo-cable-5264-3pin')).toBe(false);
  });
});
