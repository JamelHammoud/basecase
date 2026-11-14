import type { MainModule } from '@mujoco/mujoco';
import { calibrateServo } from '../../src/reality/calibrate';
import { fitPopulation, type ServoPopulation } from '../../src/reality/population';
import type { ServoCalibration } from '../../src/reality/types';
import { hiddenUnits } from './evaluate';
import type { Family } from './units';

export async function calibratedUnits(mj: MainModule, seed: string, family: Family): Promise<ServoCalibration[]> {
  const calibrations: ServoCalibration[] = [];

  for (const unit of hiddenUnits(seed, family))
    calibrations.push(await calibrateServo({ family, logs: unit.logs.calibration, mj }));

  return calibrations;
}

export function twinPopulation(calibrations: readonly ServoCalibration[]): ServoPopulation {
  const population = fitPopulation(calibrations, 'emulated');

  if (!population) throw new Error('Fewer than 8 hidden units read Measured, so there is no population to test.');

  return population;
}
