import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { BENCH_JOINT, benchInput } from './bench';
import { benchLogs, type BenchRecording, type BenchSample } from './benchLogs';
import { BENCH, BENCH_SECONDS, benchOffset, EMULATED_LOAD } from './benchSequence';
import { calibratedInput, calibrateServo } from './calibrate';
import { predictLog, type FitContext } from './fitServo';
import { activeCalibrations } from './history';
import { keepBenchLogs } from './benchLogStore';
import { jointReplay } from './jointReplay';
import { LADDER } from './ladder';
import { medianError, replayTrace } from './replayTrace';
import { withCalibration, withRollBack } from './projectCalibrations';
import { presetServo } from './servoEstimate';
import { scaledFit, type ServoScales } from './servoParams';
import { FAMILY_SERVOS } from './servoPart';
import type { ServoLog } from './types';

const STATUS_S = 0.1;
const COUNT = (2 * Math.PI) / 4096;
const START = 0.4;
const STS = FAMILY_SERVOS.sts3215;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const times = (from: number, to: number) =>
  Array.from({ length: Math.round((to - from) / STATUS_S) }, (_, i) => from + i * STATUS_S);

function servoTrack(scales: ServoScales, seconds: number[]): number[] {
  const ctx: FitContext = { mj, servo: STS, preset: presetServo(STS) };
  const goalRad = seconds.map(benchOffset);
  const blank: ServoLog = {
    servo: STS,
    dt: STATUS_S,
    goalRad,
    positionRad: goalRad.map(() => 0),
    loadRatio: goalRad.map(() => 0),
    volts: goalRad.map(() => 7.4),
    temperatureC: goalRad.map(() => 30),
    payload: EMULATED_LOAD,
  };

  return [...predictLog(ctx, scaledFit(ctx.preset.fit, scales), blank)].map((p) => Math.round(p / COUNT) * COUNT);
}

function recording(scales: ServoScales): BenchRecording {
  const halves = [times(0, BENCH.logS), times(BENCH.logS, BENCH_SECONDS)];
  const samples: BenchSample[] = halves.flatMap((seconds) => {
    const track = servoTrack(scales, seconds);

    return seconds.map((s, i) => ({
      seconds: s,
      joints: [{ positionRad: START + track[i], volts: 7.4, temperatureC: 30 }],
    }));
  });

  return { starts: [START], samples };
}

const logsOf = (rec: BenchRecording) => benchLogs({ recording: rec, joint: 0, servo: STS });

const shuffled = (rec: BenchRecording): BenchRecording => {
  const positions = rec.samples.map((s) => s.joints[0]);
  const blocks = Array.from({ length: Math.ceil(positions.length / 15) }, (_, b) =>
    positions.slice(b * 15, b * 15 + 15),
  );
  const reordered = blocks.reverse().flat();

  return { ...rec, samples: rec.samples.map((s, i) => ({ ...s, joints: [reordered[i]] })) };
};

describe('the bench sequence', () => {
  it('stays under the Test speed cap, starts and ends at rest', () => {
    const step = 0.01;
    const seconds = times(0, BENCH_SECONDS + 1);
    const speeds = seconds.map((t) => Math.abs(benchOffset(t + step) - benchOffset(t)) / step);

    expect(Math.max(...speeds)).toBeLessThan(0.5);
    expect(benchOffset(0)).toBe(0);
    expect(benchOffset(BENCH_SECONDS)).toBe(0);
    expect(Math.max(...seconds.map((t) => Math.abs(benchOffset(t))))).toBeLessThanOrEqual(0.25);
  });

  it('splits a recording into one log per half, relative to where each joint started', () => {
    const logs = logsOf(recording({}));

    expect(logs).toHaveLength(BENCH.logs);
    expect(logs[0].dt).toBeCloseTo(STATUS_S, 6);
    expect(logs[0].goalRad.length).toBeGreaterThanOrEqual(80);
    expect(Math.abs(logs[0].positionRad[0])).toBeLessThan(COUNT);
    expect(logs[1].goalRad[0]).toBeCloseTo(0, 6);
  });
});

describe('calibrating from the bench', () => {
  it('measures a servo that differs from the preset, and the sim then runs on it', async () => {
    const calibration = await calibrateServo({
      servo: STS,
      logs: logsOf(recording({ gain: Math.log(0.5) })),
      mj,
    });

    expect(calibration.verdict).toBe('measured');

    const project = withCalibration({ ...DEFAULT_PROJECT }, BENCH_JOINT, calibration);
    const input = benchInput(STS, EMULATED_LOAD);
    const scene = { ...input, project: { ...input.project, servoCalibrations: project.servoCalibrations } };
    const simInput = calibratedInput(scene, activeCalibrations(scene.project.servoCalibrations));

    expect(project.servoCalibrations?.[BENCH_JOINT].active).toBe(1);
    expect(simInput.servoFits?.[BENCH_JOINT].fit).toEqual(calibration.fit);
    expect(buildMjcf(simInput).xml).not.toBe(buildMjcf(input).xml);
  }, 60_000);

  it('a seeded bad log can’t tell and keeps the previous active version', async () => {
    const good = await calibrateServo({
      servo: STS,
      logs: logsOf(recording({ gain: Math.log(0.5) })),
      mj,
    });
    const bad = await calibrateServo({
      servo: STS,
      logs: logsOf(shuffled(recording({ gain: Math.log(0.5) }))),
      mj,
    });
    const project = withCalibration(withCalibration({ ...DEFAULT_PROJECT }, BENCH_JOINT, good), BENCH_JOINT, bad);
    const history = project.servoCalibrations?.[BENCH_JOINT];

    expect(bad.verdict).toBe('cant-tell');
    expect(history?.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(history?.active).toBe(1);
    expect(withRollBack(project, BENCH_JOINT).servoCalibrations?.[BENCH_JOINT].active).toBeNull();
  }, 60_000);
});

describe('replaying the bench log', () => {
  const HIDDEN: ServoScales = { gain: Math.log(0.5) };

  it('a hidden unit’s replay error falls from preset to calibrated by the gate’s margin', async () => {
    const logs = logsOf(recording(HIDDEN));
    const calibration = await calibrateServo({ servo: STS, logs, mj });
    const kept = { ...calibration, logId: keepBenchLogs(STS, logs) };
    const history = withCalibration({ ...DEFAULT_PROJECT }, BENCH_JOINT, kept).servoCalibrations![BENCH_JOINT];
    const replay = await jointReplay(history);
    const samples = logs.reduce((n, log) => n + log.positionRad.length, 0);

    expect(calibration.verdict).toBe('measured');
    expect(replay?.version).toBe(1);
    expect(replay?.logged).toHaveLength(samples);
    expect(replay?.preset.positionRad).toHaveLength(samples);
    expect(replay?.calibration?.positionRad).toHaveLength(samples);
    expect(replay!.calibration!.medianErrorRad).toBeLessThanOrEqual(
      replay!.preset.medianErrorRad! * (1 - LADDER.passGain),
    );
    expect((await jointReplay(history, 1))?.calibration).toBe(replay?.calibration);
  }, 90_000);

  it('a shuffled log shows no gain and stays Can’t tell', async () => {
    const logs = logsOf(shuffled(recording(HIDDEN)));
    const calibration = await calibrateServo({ servo: STS, logs, mj });
    const kept = { ...calibration, logId: keepBenchLogs(STS, logs) };
    const history = withCalibration({ ...DEFAULT_PROJECT }, BENCH_JOINT, kept).servoCalibrations![BENCH_JOINT];
    const replay = await jointReplay(history);
    const asFitted = replayTrace(mj, { servo: STS, logs, fit: calibration.fit });

    expect(calibration.verdict).toBe('cant-tell');
    expect(history.active).toBeNull();
    expect(replay?.calibration).toBeNull();
    expect(asFitted.medianErrorRad).toBeCloseTo(replay!.preset.medianErrorRad!, 9);
  }, 90_000);

  it('skips samples a status missed, including the first', () => {
    const full = recording({});
    const missed = new Set([0, 1, 7, 30]);
    const gappy: BenchRecording = {
      ...full,
      samples: full.samples.map((s, i) =>
        missed.has(i) ? { ...s, joints: [{ positionRad: null, volts: null, temperatureC: null }] } : s,
      ),
    };
    const whole = replayTrace(mj, { servo: STS, logs: logsOf(full) });
    const gapped = replayTrace(mj, { servo: STS, logs: logsOf(gappy) });

    expect(gapped.positionRad.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(gapped.medianErrorRad)).toBe(true);
    expect(gapped.medianErrorRad).toBeLessThan(whole.medianErrorRad! + COUNT);
  }, 60_000);

  it('has no median error when every sample was missed', () => {
    const [log] = logsOf(recording({}));
    const missed = { ...log, positionRad: log.positionRad.map(() => Number.NaN) };

    expect(medianError([log.positionRad], [missed])).toBeNull();
  });
});
