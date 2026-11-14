import type { ServoFit } from '../data/components';
import { DYNAMICS_TERMS } from '../sim/servoModel';
import type { ServoSpread } from '../skills/environment';
import { chiSquareQuantile, cholesky, mahalanobis, transformed, type Matrix } from '../utils/gaussian';
import { SERVO_PARAMS, scaledFit, scalesOf, type ServoParam } from './servoParams';
import { sameServo, servoName, servoPartOf } from './servoPart';
import type { ServoCalibration, ServoPart } from './types';

export const POPULATION = Object.freeze({ minUnits: 8, outlierZ: 3.5, floorLog: 0.01, band: 0.9 });

export type PopulationSource = 'measured' | 'emulated';

export interface ServoPopulation {
  servo: ServoPart;
  volts: number;
  source: PopulationSource;
  units: number;
  median: number[];
  covariance: Matrix;
}

const MAD_TO_SIGMA = 1.4826;

export const populationKey = (servo: ServoPart, volts: number) => `${servoName(servo)} at ${volts.toFixed(1)} V`;

const keyOf = (c: ServoCalibration) => populationKey(servoPartOf(c), c.volts);

export const logScales = (scales: Partial<Record<ServoParam, number>>) =>
  SERVO_PARAMS.map((p) => Math.log(scales[p] ?? 1));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const column = (rows: number[][], k: number) => rows.map((r) => r[k]);

function inliers(rows: number[][], center: number[]): number[][] {
  const sigma = center.map((c, k) =>
    Math.max(POPULATION.floorLog, MAD_TO_SIGMA * median(column(rows, k).map((v) => Math.abs(v - c)))),
  );
  const kept = rows.filter((r) => r.every((v, k) => Math.abs(v - center[k]) <= POPULATION.outlierZ * sigma[k]));

  return kept.length >= POPULATION.minUnits ? kept : rows;
}

function predictiveCovariance(rows: number[][], center: number[]): Matrix {
  const n = rows.length;
  const live = center.filter((_, k) => rows.some((r) => r[k] !== 0)).length;
  const widen = ((n + 1) / n) * ((n - 1) / Math.max(1, n - live - 2));

  return center.map((ci, i) =>
    center.map((cj, j) => {
      const sum = rows.reduce((s, r) => s + (r[i] - ci) * (r[j] - cj), 0) / (n - 1);

      return sum * widen + (i === j ? POPULATION.floorLog ** 2 : 0);
    }),
  );
}

export function fitPopulation(
  calibrations: readonly ServoCalibration[],
  source: PopulationSource = 'measured',
): ServoPopulation | null {
  const measured = calibrations.filter((c) => c.verdict === 'measured');
  const [first] = measured;

  if (measured.length < POPULATION.minUnits || measured.some((c) => keyOf(c) !== keyOf(first))) return null;

  const rows = measured.map((c) => logScales(c.scales));
  const center = SERVO_PARAMS.map((_, k) => median(column(rows, k)));

  return {
    servo: servoPartOf(first),
    volts: first.volts,
    source,
    units: measured.length,
    median: center,
    covariance: predictiveCovariance(inliers(rows, center), center),
  };
}

export function fitPopulations(
  calibrations: readonly ServoCalibration[],
  source: PopulationSource = 'measured',
): ServoPopulation[] {
  const groups = new Map<string, ServoCalibration[]>();

  for (const c of calibrations) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);

  return [...groups.keys()]
    .sort()
    .map((key) => fitPopulation(groups.get(key)!, source))
    .filter((p): p is ServoPopulation => p !== null);
}

export const populationFor = (populations: readonly ServoPopulation[], servo: ServoPart, volts: number) =>
  populations.find((p) => sameServo(p.servo, servo) && Math.abs(p.volts - volts) < 0.05) ?? null;

export const populationFit = (population: ServoPopulation, preset: ServoFit): ServoFit =>
  scaledFit(preset, scalesOf(SERVO_PARAMS, population.median));

export function bandDistance(population: ServoPopulation, scales: Partial<Record<ServoParam, number>>): number {
  const lower = cholesky(population.covariance);

  if (!lower) throw new Error(`The population of ${servoName(population.servo)} has no covariance.`);

  return mahalanobis(
    lower,
    logScales(scales).map((v, k) => v - population.median[k]),
  );
}

export const bandLimit = (level: number = POPULATION.band) => chiSquareQuantile(SERVO_PARAMS.length, level);

export const inBand = (
  population: ServoPopulation,
  scales: Partial<Record<ServoParam, number>>,
  level: number = POPULATION.band,
) => bandDistance(population, scales) <= bandLimit(level);

const DYNAMICS_OF: Record<(typeof DYNAMICS_TERMS)[number], Partial<Record<ServoParam, number>>> = {
  kp: { gain: 1 },
  damping: { damping: 1 },
  armature: { armature: 1 },
  frictionloss: { friction: 0.5, loadFriction: 0.5 },
  forceNm: { force: 1 },
  delayS: { delay: 1 },
};

const TO_DYNAMICS: Matrix = DYNAMICS_TERMS.map((t) => SERVO_PARAMS.map((p) => DYNAMICS_OF[t][p] ?? 0));

export const servoSpread = (population: ServoPopulation, joints: string[]): ServoSpread => ({
  servo: populationKey(population.servo, population.volts),
  joints,
  covariance: transformed(TO_DYNAMICS, population.covariance),
});
