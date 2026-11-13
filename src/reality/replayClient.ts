import type { RobotJoint } from '../types/robotics';
import { workerClient, type WorkerClient } from '../utils/workerRpc';
import { errorDegrees, type ReplayRequest, type VersionReplay } from './benchReplay';
import type { CalibrationHistory } from './history';
import type { ReplayLog, ServoCalibration } from './types';

type ReplayHandlers = {
  replay: (request: ReplayRequest) => Promise<{ result: VersionReplay }>;
};

const localHandlers = async (): Promise<ReplayHandlers> => {
  const [{ replayVersion }, { loadedMujoco }] = await Promise.all([import('./benchReplay'), import('./calibrate')]);

  return { replay: async (request) => ({ result: replayVersion(await loadedMujoco(), request) }) };
};

let client: WorkerClient<ReplayHandlers> | null = null;

const replayWorker = () =>
  (client ??= workerClient<ReplayHandlers>(
    () => new Worker(new URL('./calibrate.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  ));

const cache = new WeakMap<ReplayLog[], Map<number, Promise<VersionReplay>>>();

function cached(logs: ReplayLog[], version: number, run: () => Promise<VersionReplay>): Promise<VersionReplay> {
  const byVersion = cache.get(logs) ?? new Map<number, Promise<VersionReplay>>();
  const hit = byVersion.get(version);

  cache.set(logs, byVersion);

  if (hit) return hit;

  const made = run();

  made.catch(() => byVersion.delete(version));
  byVersion.set(version, made);

  return made;
}

export const replayFamily = (history: CalibrationHistory) => history.versions.at(-1)?.family ?? null;

export function replayOf(history: CalibrationHistory, calibration: ServoCalibration | null): Promise<VersionReplay> {
  const { logs } = history;
  const family = replayFamily(history);

  if (!logs?.length || !family) return Promise.reject(new Error('This joint has no bench log'));

  const fitted = calibration?.verdict === 'measured' ? calibration : null;

  return cached(logs, fitted?.version ?? 0, () => replayWorker().call('replay', { family, logs, fit: fitted?.fit }));
}

export const replayable = (history: CalibrationHistory | undefined): history is CalibrationHistory =>
  Boolean(history?.logs?.length && replayFamily(history));

export const replayedVersion = (history: CalibrationHistory, version: number | null) =>
  history.versions.find((c) => c.version === version && c.verdict === 'measured') ?? null;

export interface JointReplayErrors {
  version: number;
  presetRad: number;
  calibratedRad: number | null;
}

export async function jointReplayErrors(
  history: CalibrationHistory | undefined,
  version: number | null = history?.active ?? null,
): Promise<JointReplayErrors | null> {
  if (!replayable(history)) return null;

  const chosen = replayedVersion(history, version);
  const [preset, calibrated] = await Promise.all([
    replayOf(history, null),
    chosen ? replayOf(history, chosen) : Promise.resolve(null),
  ]);

  return {
    version: chosen?.version ?? 0,
    presetRad: preset.medianErrorRad,
    calibratedRad: calibrated?.medianErrorRad ?? null,
  };
}

function errorLine(name: string, errors: JointReplayErrors): string {
  const preset = `${errorDegrees(errors.presetRad)} on the preset`;

  if (errors.calibratedRad === null) return `${name}: ${preset}, no calibration active.`;

  return `${name}: ${preset}, ${errorDegrees(errors.calibratedRad)} on v${errors.version}.`;
}

export async function replayErrorsText(
  joints: readonly RobotJoint[],
  histories: Record<string, CalibrationHistory> | undefined,
): Promise<string> {
  const replayed = await Promise.all(
    joints.map(async (joint) => {
      const errors = await jointReplayErrors(histories?.[joint.id]);

      return errors ? errorLine(joint.name, errors) : null;
    }),
  );
  const lines = replayed.filter((line) => line !== null);

  return lines.length ? `Median error replaying each servo's bench log: ${lines.join(' ')}` : '';
}
