import fs from 'node:fs';
import path from 'node:path';
import { buildMjcf } from '../../src/sim/mjcf';
import type { MjcfInput } from '../../src/sim/mjcfTypes';
import { need, repoPath } from '../lib/need';
import { seededRng, shuffled } from '../zoo/rng';
import type { UnitLogs } from './excite';
import type { ModelFor } from './evaluate';
import type { ServoLog } from './plant';
import { TWIN_JOINT, twinInput } from './sim';
import type { Family } from './units';

export type CalibrationVerdict = 'measured' | 'consistent' | 'cant-tell';

export interface Calibration {
  verdict: CalibrationVerdict;
}

export interface CalibrateModule {
  calibrateServo: (input: { family: Family; logs: ServoLog[] }) => Promise<Calibration>;
  calibratedInput: (input: MjcfInput, calibrations: Record<string, Calibration>) => MjcfInput;
}

export const loadCalibrator = () =>
  need<CalibrateModule>('src/reality/calibrate', ['calibrateServo', 'calibratedInput']);

export const calibratedModel =
  (mod: CalibrateModule, family: Family, calibration: Calibration): ModelFor =>
  (payload) =>
    buildMjcf(mod.calibratedInput(twinInput(family, payload), { [TWIN_JOINT]: calibration }));

const BLOCK = 100;

function blockShuffled(log: ServoLog, seed: string): ServoLog {
  const blocks = Math.ceil(log.positionRad.length / BLOCK);
  const order = shuffled(seededRng(seed), [...Array(blocks).keys()]);
  const permute = (series: number[]) => order.flatMap((b) => series.slice(b * BLOCK, (b + 1) * BLOCK));

  return {
    ...log,
    positionRad: permute(log.positionRad),
    loadRatio: permute(log.loadRatio),
    volts: permute(log.volts),
    temperatureC: permute(log.temperatureC),
  };
}

export function shuffledLogs(all: UnitLogs[], index: number, seed: string): ServoLog[] {
  const donor = all[(index + 1) % all.length];

  return donor.calibration.map((log, i) => blockShuffled(log, `${seed}-${index}-${i}`));
}

export function saveHidden(name: string, value: unknown) {
  const file = repoPath('verify', 'out', 'twin', name);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}
