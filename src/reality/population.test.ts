import { describe, expect, it } from 'vitest';
import { seededRandom } from '../utils/seededRandom';
import { bandDistance, fitPopulation, fitPopulations, inBand, POPULATION, populationKey } from './population';
import { BUNDLED_POPULATIONS, populationOf, SERVO_POPULATIONS, type BundledPopulation } from './servoPopulations';
import { FAMILY_SERVOS } from './servoPart';
import type { ServoCalibration, ServoPart } from './types';

const STS = FAMILY_SERVOS.sts3215;

function unit(scales: Record<string, number>, options: { servo?: ServoPart; volts?: number } = {}): ServoCalibration {
  return {
    verdict: 'measured',
    version: 1,
    rung: 'response',
    fit: {} as ServoCalibration['fit'],
    volts: options.volts ?? 7.4,
    scales,
    conditions: { volts: 7.4, temperatureC: 25 },
    evidence: { logs: 6, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.9, reason: '' },
    servo: options.servo ?? STS,
  };
}

function units(count: number, seed = '0123456789abcdef0123456789abcdef'): ServoCalibration[] {
  const random = seededRandom(seed);

  return Array.from({ length: count }, () => {
    const gain = Math.exp(0.2 * (random() - 0.5));

    return unit({ gain, delay: gain ** 2 * Math.exp(0.1 * (random() - 0.5)), damping: Math.exp(0.3 * random()) });
  });
}

const asCalibrations = (population: BundledPopulation) =>
  population.fits.map((f) => ({ ...unit(f.scales, { servo: population.servo, volts: population.volts }), ...f }));

describe('servo populations', () => {
  it('needs at least 8 measured units', () => {
    expect(fitPopulation(units(POPULATION.minUnits - 1))).toBeNull();
    expect(fitPopulation([...units(7), { ...unit({ gain: 1.1 }), verdict: 'consistent' }])).toBeNull();
    expect(fitPopulation(units(POPULATION.minUnits))).not.toBeNull();
  });

  it('fits the same population from the same calibrations, in any order', () => {
    const all = units(12);
    const once = fitPopulation(all)!;

    expect(fitPopulation(all)).toEqual(once);
    expect(fitPopulation([...all].reverse())!.median).toEqual(once.median);
    once.covariance
      .flat()
      .forEach((v, i) => expect(fitPopulation([...all].reverse())!.covariance.flat()[i]).toBeCloseTo(v, 12));
  });

  it('keeps correlated gain and delay correlated', () => {
    const { covariance: c } = fitPopulation(units(24))!;

    expect(c[0][1] / Math.sqrt(c[0][0] * c[1][1])).toBeGreaterThan(0.8);
  });

  it('keeps one wild unit from widening the spread', () => {
    const tame = fitPopulation(units(16))!;
    const wild = fitPopulation([...units(16), unit({ gain: 3.5, delay: 7 })])!;

    expect(wild.covariance[0][0]).toBeLessThan(1.3 * tame.covariance[0][0]);
  });

  it('keys each population by servo, variant and voltage', () => {
    const other = { componentId: 'feetech-sts3215', variant: 'c044' };
    const mixed = [
      ...units(8),
      ...units(8).map((c) => ({ ...c, servo: other })),
      ...units(8).map((c) => ({ ...c, volts: 12 })),
    ];

    expect(fitPopulations(mixed).map((p) => populationKey(p.servo, p.volts))).toEqual([
      'feetech-sts3215 c001 at 12.0 V',
      'feetech-sts3215 c001 at 7.4 V',
      'feetech-sts3215 c044 at 7.4 V',
    ]);
    expect(fitPopulation(mixed)).toBeNull();
  });

  it('ships one emulated population per servo family, regenerated from the fits it carries', () => {
    expect(SERVO_POPULATIONS.map((p) => p.servo)).toEqual([FAMILY_SERVOS.sts3215, FAMILY_SERVOS.xl330]);

    for (const bundled of BUNDLED_POPULATIONS.populations) {
      const population = populationOf(bundled);

      expect(population.source).toBe('emulated');
      expect(population.units).toBe(24);
      expect(fitPopulation(asCalibrations(bundled), 'emulated')).toEqual(population);
    }
  });

  for (const bundled of BUNDLED_POPULATIONS.populations)
    it(`${bundled.servo.componentId}: a population from 16 hidden units holds at least 7 of the other 8 in its 90% band`, () => {
      const all = asCalibrations(bundled);
      const population = fitPopulation(all.slice(0, 16), 'emulated')!;
      const held = all.slice(16).filter((c) => inBand(population, c.scales));

      expect(
        held.length,
        all
          .slice(16)
          .map((c) => bandDistance(population, c.scales).toFixed(1))
          .join(' '),
      ).toBeGreaterThanOrEqual(7);
    });
});
