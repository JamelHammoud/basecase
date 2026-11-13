import { keptBenchLogs } from './benchLogStore';
import type { CalibrationHistory } from './history';
import { cachedReplay } from './replayClient';
import { loggedTrace, type ReplayTrace } from './replayTrace';
import type { ServoCalibration } from './types';

export interface JointReplay {
  version: number | null;
  logged: number[];
  preset: ReplayTrace;
  calibration: ReplayTrace | null;
}

export const benchLogOf = (history: CalibrationHistory) =>
  history.versions
    .map((c) => keptBenchLogs(c.logId))
    .filter((kept) => kept !== null)
    .at(-1) ?? null;

export const measuredVersions = (history: CalibrationHistory) =>
  history.versions.filter((c) => c.verdict === 'measured');

export function shownCalibration(history: CalibrationHistory, version: number | null): ServoCalibration | null {
  const wanted = version ?? history.active;

  return measuredVersions(history).find((c) => c.version === wanted) ?? null;
}

export function replayKey(history: CalibrationHistory, version: number | null): string | null {
  const bench = benchLogOf(history);

  return bench ? `${bench.logId}:${shownCalibration(history, version)?.version ?? 0}` : null;
}

export async function jointReplay(history: CalibrationHistory, version: number | null = null) {
  const bench = benchLogOf(history);

  if (!bench) return null;

  const shown = shownCalibration(history, version);
  const request = { family: bench.family, logs: bench.logs };
  const [preset, calibration] = await Promise.all([
    cachedReplay({ logId: bench.logId, version: 0 }, request),
    shown ? cachedReplay({ logId: bench.logId, version: shown.version }, { ...request, fit: shown.fit }) : null,
  ]);
  const replay: JointReplay = { version: shown?.version ?? null, logged: loggedTrace(bench.logs), preset, calibration };

  return replay;
}

export interface ReplayErrors {
  version: number | null;
  presetErrorRad: number;
  calibrationErrorRad: number | null;
}

export async function replayErrors(history: CalibrationHistory | undefined): Promise<ReplayErrors | null> {
  const replay = history ? await jointReplay(history) : null;

  if (!replay) return null;

  return {
    version: replay.version,
    presetErrorRad: replay.preset.medianErrorRad,
    calibrationErrorRad: replay.calibration?.medianErrorRad ?? null,
  };
}
