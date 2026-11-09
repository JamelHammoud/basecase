import fs from 'node:fs';
import type { MainModule } from '@mujoco/mujoco';
import { repoPath } from '../lib/need';
import { calibratedModel, saveHidden, shuffledLogs, type CalibrateModule, type CalibrationVerdict } from './calibrate';
import { familyVerdict, hiddenUnits, presetUnits, scoreUnit, type FamilyVerdict, type ModelFor } from './evaluate';
import type { ServoLog } from './plant';
import type { Family } from './units';

export const HIDDEN_DIR = repoPath('verify', 'out', 'twin');

export interface Fitted {
  verdict: CalibrationVerdict;
  modelFor: ModelFor;
}

export type Fitter = (family: Family, logs: ServoLog[]) => Promise<Fitted>;

export const calibratorFitter =
  (mod: CalibrateModule): Fitter =>
  async (family, logs) => {
    const calibration = await mod.calibrateServo({ family, logs });

    return { verdict: calibration.verdict, modelFor: calibratedModel(mod, family, calibration) };
  };

export const sessionTag = (family: Family, seed: string) => `${family}-${seed.slice(0, 12)}`;

const leaked = (tag: string) =>
  fs.existsSync(HIDDEN_DIR) ? fs.readdirSync(HIDDEN_DIR).filter((f) => f.includes(tag)) : [];

async function sealed<T>(tag: string, work: () => Promise<T>): Promise<T> {
  const before = leaked(tag);

  if (before.length) throw new Error(`Hidden files for this run exist while the calibrator runs: ${before.join(', ')}`);

  const result = await work();
  const after = leaked(tag);

  if (after.length)
    throw new Error(`Hidden files for this run were written while the calibrator ran: ${after.join(', ')}`);

  return result;
}

export interface FamilyRun {
  verdict: FamilyVerdict;
  verdicts: CalibrationVerdict[];
}

export interface Session {
  own: FamilyRun;
  shuffled: FamilyRun | null;
  preset: CalibrationVerdict[];
}

interface SessionInput {
  mj: MainModule;
  seed: string;
  family: Family;
  fitter: Fitter;
  controls?: boolean;
}

export async function runSession({ mj, seed, family, fitter, controls = true }: SessionInput): Promise<Session> {
  const units = hiddenUnits(seed, family);
  const tag = sessionTag(family, seed);
  const all = units.map((u) => u.logs);

  const scored = (logsFor: (i: number) => ServoLog[]) =>
    sealed(tag, async () => {
      const verdicts: CalibrationVerdict[] = [];
      const scores = [];

      for (const [i, u] of units.entries()) {
        const fitted = await fitter(family, logsFor(i));

        verdicts.push(fitted.verdict);
        scores.push(scoreUnit(mj, family, u.logs, fitted.modelFor));
      }

      return { verdict: familyVerdict(scores), verdicts };
    });

  const own = await scored((i) => units[i].logs.calibration);
  const shuffled = controls ? await scored((i) => shuffledLogs(all, i, seed)) : null;
  const preset = controls
    ? await sealed(tag, async () => {
        const verdicts: CalibrationVerdict[] = [];

        for (const u of presetUnits(mj, seed, family))
          verdicts.push((await fitter(family, u.logs.calibration)).verdict);

        return verdicts;
      })
    : [];

  saveHidden(`calibration-${tag}.json`, { units: units.map((u) => u.unit), metrics: own.verdict.metrics });

  return { own, shuffled, preset };
}
