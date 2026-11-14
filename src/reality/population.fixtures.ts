import { seededRandom } from '../utils/seededRandom';
import { fitPopulation, type ServoPopulation } from './population';
import { FAMILY_SERVOS } from './servoPart';
import type { ServoCalibration, ServoPart } from './types';

const SEED = '0123456789abcdef0123456789abcdef';

export function measuredUnit(
  scales: Record<string, number>,
  options: { servo?: ServoPart; volts?: number } = {},
): ServoCalibration {
  return {
    verdict: 'measured',
    version: 1,
    rung: 'response',
    fit: {} as ServoCalibration['fit'],
    volts: options.volts ?? 7.4,
    scales,
    conditions: { volts: 7.4, temperatureC: 25 },
    evidence: { logs: 6, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.9, reason: '' },
    servo: options.servo ?? FAMILY_SERVOS.sts3215,
  };
}

export function measuredUnits(
  count: number,
  options: { seed?: string; gain?: number; delay?: number } = {},
): ServoCalibration[] {
  const random = seededRandom(options.seed ?? SEED);

  return Array.from({ length: count }, () => {
    const spread = Math.exp(0.2 * (random() - 0.5));

    return measuredUnit({
      gain: (options.gain ?? 1) * spread,
      delay: (options.delay ?? 1) * spread ** 2 * Math.exp(0.1 * (random() - 0.5)),
      damping: Math.exp(0.3 * random()),
    });
  });
}

export const FIXTURE_POPULATIONS: readonly ServoPopulation[] = [
  fitPopulation(measuredUnits(24, { gain: 1.1, delay: 2.5 }))!,
];
