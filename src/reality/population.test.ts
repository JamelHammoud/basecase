import { describe, expect, it } from 'vitest';
import { fitPopulation, fitPopulations, inBand, POPULATION, populationKey } from './population';
import { measuredUnit, measuredUnits } from './population.fixtures';

describe('servo populations', () => {
  it('needs at least 8 measured units', () => {
    expect(fitPopulation(measuredUnits(POPULATION.minUnits - 1))).toBeNull();
    expect(fitPopulation([...measuredUnits(7), { ...measuredUnit({ gain: 1.1 }), verdict: 'consistent' }])).toBeNull();
    expect(fitPopulation(measuredUnits(POPULATION.minUnits))).not.toBeNull();
  });

  it('fits the same population from the same calibrations, in any order', () => {
    const all = measuredUnits(12);
    const once = fitPopulation(all)!;

    expect(fitPopulation(all)).toEqual(once);
    expect(fitPopulation([...all].reverse())!.median).toEqual(once.median);
    once.covariance
      .flat()
      .forEach((v, i) => expect(fitPopulation([...all].reverse())!.covariance.flat()[i]).toBeCloseTo(v, 12));
  });

  it('keeps correlated gain and delay correlated', () => {
    const { covariance: c } = fitPopulation(measuredUnits(24))!;

    expect(c[0][1] / Math.sqrt(c[0][0] * c[1][1])).toBeGreaterThan(0.8);
  });

  it('keeps one wild unit from widening the spread', () => {
    const tame = fitPopulation(measuredUnits(16))!;
    const wild = fitPopulation([...measuredUnits(16), measuredUnit({ gain: 3.5, delay: 7 })])!;

    expect(wild.covariance[0][0]).toBeLessThan(1.3 * tame.covariance[0][0]);
  });

  it('keys each population by servo, variant and voltage', () => {
    const other = { componentId: 'feetech-sts3215', variant: 'c044' };
    const mixed = [
      ...measuredUnits(8),
      ...measuredUnits(8).map((c) => ({ ...c, servo: other })),
      ...measuredUnits(8).map((c) => ({ ...c, volts: 12 })),
    ];

    expect(fitPopulations(mixed).map((p) => populationKey(p.servo, p.volts))).toEqual([
      'feetech-sts3215 c001 at 12.0 V',
      'feetech-sts3215 c001 at 7.4 V',
      'feetech-sts3215 c044 at 7.4 V',
    ]);
    expect(fitPopulation(mixed)).toBeNull();
  });

  it('holds new units of the same servo in its 90% band', () => {
    const all = measuredUnits(24, { gain: 1.1, delay: 2.5 });
    const population = fitPopulation(all.slice(0, 16))!;

    expect(all.slice(16).filter((c) => inBand(population, c.scales)).length).toBeGreaterThanOrEqual(7);
  });
});
