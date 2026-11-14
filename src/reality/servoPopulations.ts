import bundled from './servoPopulations.json';
import type { ServoPopulation } from './population';
import type { CalibrationVerdict } from './types';

export interface BundledFit {
  verdict: CalibrationVerdict;
  scales: Record<string, number>;
}

export type BundledPopulation = ServoPopulation & { fits: BundledFit[] };

export const BUNDLED_POPULATIONS = bundled as { seed: string; populations: BundledPopulation[] };

export const populationOf = (b: BundledPopulation): ServoPopulation => ({
  servo: b.servo,
  volts: b.volts,
  source: b.source,
  units: b.units,
  median: b.median,
  covariance: b.covariance,
});

export const SERVO_POPULATIONS: readonly ServoPopulation[] = BUNDLED_POPULATIONS.populations.map(populationOf);
