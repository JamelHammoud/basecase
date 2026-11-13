import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { BENCH_JOINT, presetServo } from './bench';
import { benchLogs, type BenchRecording } from './benchLogs';
import { BENCH, BENCH_SECONDS, benchOffset, EMULATED_LOAD } from './benchSequence';
import { errorDegrees, loggedTrace, replayVersion, storedLogs } from './benchReplay';
import { calibrateServo } from './calibrate';
import { predictLog } from './fitServo';
import { EMPTY_HISTORY, recordCalibration } from './history';
import { LADDER } from './ladder';
import { jointReplayErrors, replayErrorsText, replayOf } from './replayClient';
import { scaledFit, type ServoScales } from './servoParams';
import type { RobotJoint } from '../types/robotics';
import type { ServoLog } from './types';

const STATUS_S = 0.1;
const COUNT = (2 * Math.PI) / 4096;
const TWIN: ServoScales = { gain: Math.log(0.5), delay: Math.log(2) };

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const times = (from: number, to: number) =>
  Array.from({ length: Math.round((to - from) / STATUS_S) }, (_, i) => from + i * STATUS_S);

function twinTrack(seconds: number[]): number[] {
  const preset = presetServo('sts3215');
  const goalRad = seconds.map(benchOffset);
  const blank: ServoLog = {
    family: 'sts3215',
    dt: STATUS_S,
    goalRad,
    positionRad: goalRad.map(() => 0),
    loadRatio: goalRad.map(() => 0),
    volts: goalRad.map(() => 7.4),
    temperatureC: goalRad.map(() => 30),
    payload: EMULATED_LOAD,
  };
  const ctx = { mj, family: 'sts3215' as const, preset };

  return [...predictLog(ctx, scaledFit(preset.fit, TWIN), blank)].map((p) => Math.round(p / COUNT) * COUNT);
}

function twinRecording(): BenchRecording {
  const halves = [times(0, BENCH.logS), times(BENCH.logS, BENCH_SECONDS)];
  const samples = halves.flatMap((seconds) => {
    const track = twinTrack(seconds);

    return seconds.map((s, i) => ({ seconds: s, joints: [{ positionRad: track[i], volts: 7.4, temperatureC: 30 }] }));
  });

  return { family: 'sts3215', starts: [0], samples };
}

function shuffled(rec: BenchRecording): BenchRecording {
  const positions = rec.samples.map((s) => s.joints[0]);
  const blocks = Array.from({ length: Math.ceil(positions.length / 10) }, (_, b) =>
    positions.slice(b * 10, b * 10 + 10),
  );
  const reordered = blocks.reverse().flat();

  return { ...rec, samples: rec.samples.map((s, i) => ({ ...s, joints: [reordered[i]] })) };
}

async function calibrated(rec: BenchRecording) {
  const logs = benchLogs(rec, 0);
  const calibration = await calibrateServo({ family: 'sts3215', logs, mj });

  return { calibration, history: recordCalibration(EMPTY_HISTORY, calibration, storedLogs(logs)) };
}

describe('replaying a bench log before and after calibration', () => {
  it('a twin unit’s replay error falls from the preset to its calibration by the gate’s margin', async () => {
    const { calibration, history } = await calibrated(twinRecording());
    const errors = await jointReplayErrors(history);

    expect(calibration.verdict).toBe('measured');
    expect(errors?.version).toBe(1);
    expect(errors!.calibratedRad).not.toBeNull();
    expect(errors!.calibratedRad!).toBeLessThanOrEqual((1 - LADDER.passGain) * errors!.presetRad);
  }, 60_000);

  it('a shuffled log shows no gain and its verdict stays Can’t tell', async () => {
    const { calibration, history } = await calibrated(shuffled(twinRecording()));
    const errors = await jointReplayErrors(history, 1);
    const [preset, latest] = await Promise.all([replayOf(history, null), replayOf(history, history.versions[0])]);

    expect(calibration.verdict).toBe('cant-tell');
    expect(history.active).toBeNull();
    expect(errors).toEqual({ version: 0, presetRad: preset.medianErrorRad, calibratedRad: null });
    expect(latest.medianErrorRad).toBe(preset.medianErrorRad);
  }, 60_000);

  it('redraws against an older version, and caches each version of a log', async () => {
    const { calibration, history } = await calibrated(twinRecording());
    const newer = recordCalibration(history, { ...calibration, fit: presetServo('sts3215').fit });
    const older = await jointReplayErrors(newer, 1);
    const active = await jointReplayErrors(newer);

    expect(newer.active).toBe(2);
    expect(newer.logs).toBe(history.logs);
    expect(older?.version).toBe(1);
    expect(active?.version).toBe(2);
    expect(active?.calibratedRad).toBeCloseTo(active!.presetRad, 9);
    expect(older!.calibratedRad!).toBeLessThan(active!.calibratedRad!);
    expect(replayOf(newer, newer.versions[0])).toBe(replayOf(newer, newer.versions[0]));
  }, 60_000);

  it('puts the logs on one time axis and replays each from where it starts', () => {
    const logs = storedLogs(benchLogs(twinRecording(), 0));
    const logged = loggedTrace(logs);
    const replay = replayVersion(mj, { family: 'sts3215', logs });

    expect(logged.positionRad).toHaveLength(replay.positionRad.length);
    expect(logged.seconds.at(-1)).toBeCloseTo(BENCH_SECONDS - STATUS_S, 6);
    expect(replay.positionRad[logs[0].positionRad.length]).toBeCloseTo(logs[1].positionRad[0], 9);
    expect(logs[0].positionRad.every((p) => Math.abs(p * 1e6 - Math.round(p * 1e6)) < 1e-6)).toBe(true);
  });

  it('tells the agent each joint’s errors in degrees', async () => {
    const { history } = await calibrated(twinRecording());
    const joint: RobotJoint = {
      id: BENCH_JOINT,
      name: 'Shoulder',
      type: 'revolute',
      parent: [],
      child: [],
      origin: [0, 0, 0],
      axis: [1, 0, 0],
    };
    const text = await replayErrorsText([joint], { [BENCH_JOINT]: history });

    expect(text).toMatch(
      /^Median error replaying each servo's bench log: Shoulder: [\d.]+° on the preset, [\d.]+° on v1\.$/,
    );
    expect(await replayErrorsText([joint], {})).toBe('');
    expect(errorDegrees(Math.PI / 180)).toBe('1.0°');
    expect(errorDegrees((12.4 * Math.PI) / 180)).toBe('12°');
  }, 60_000);
});
