import { BENCH, benchOffset, EMULATED_LOAD } from './benchSequence';
import type { ServoFamily, ServoLog } from './types';
import { median } from './verdict';

export interface BenchJointSample {
  positionRad: number | null;
  volts: number | null;
  temperatureC: number | null;
}

export interface BenchSample {
  seconds: number;
  joints: BenchJointSample[];
}

export interface BenchRecording {
  family: ServoFamily;
  starts: number[];
  samples: BenchSample[];
}

const orNaN = (value: number | null | undefined) => (typeof value === 'number' ? value : Number.NaN);

function sampleSpacing(samples: BenchSample[]): number {
  const gaps = samples.slice(1).map((s, i) => s.seconds - samples[i].seconds);

  return gaps.length ? median(gaps) : Number.NaN;
}

function logOf(recording: BenchRecording, joint: number, samples: BenchSample[]): ServoLog {
  const start = recording.starts[joint];
  const at = samples.map((s) => s.joints[joint]);

  return {
    family: recording.family,
    dt: sampleSpacing(samples),
    goalRad: samples.map((s) => benchOffset(s.seconds)),
    positionRad: at.map((j) => orNaN(j?.positionRad) - start),
    loadRatio: at.map(() => 0),
    volts: at.map((j) => orNaN(j?.volts)),
    temperatureC: at.map((j) => orNaN(j?.temperatureC)),
    payload: EMULATED_LOAD,
  };
}

export function benchLogs(recording: BenchRecording, joint: number): ServoLog[] {
  return Array.from({ length: BENCH.logs }, (_, i) =>
    logOf(
      recording,
      joint,
      recording.samples.filter((s) => s.seconds >= i * BENCH.logS && s.seconds < (i + 1) * BENCH.logS),
    ),
  );
}

export const familyOfRobot = (family: 'feetech' | 'dynamixel'): ServoFamily =>
  family === 'feetech' ? 'sts3215' : 'xl330';
