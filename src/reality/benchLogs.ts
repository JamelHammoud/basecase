import { BENCH, benchOffset, EMULATED_LOAD } from './benchSequence';
import type { ServoLog, ServoPart } from './types';
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
  starts: number[];
  samples: BenchSample[];
}

const orNaN = (value: number | null | undefined) => (typeof value === 'number' ? value : Number.NaN);

function sampleSpacing(samples: BenchSample[]): number {
  const gaps = samples.slice(1).map((s, i) => s.seconds - samples[i].seconds);

  return gaps.length ? median(gaps) : Number.NaN;
}

interface LogInput {
  recording: BenchRecording;
  joint: number;
  servo: ServoPart;
}

function logOf({ recording, joint, servo }: LogInput, samples: BenchSample[]): ServoLog {
  const start = recording.starts[joint];
  const at = samples.map((s) => s.joints[joint]);

  return {
    servo,
    dt: sampleSpacing(samples),
    goalRad: samples.map((s) => benchOffset(s.seconds)),
    positionRad: at.map((j) => orNaN(j?.positionRad) - start),
    loadRatio: at.map(() => 0),
    volts: at.map((j) => orNaN(j?.volts)),
    temperatureC: at.map((j) => orNaN(j?.temperatureC)),
    payload: EMULATED_LOAD,
  };
}

export function benchLogs(input: LogInput): ServoLog[] {
  const { recording } = input;

  return Array.from({ length: BENCH.logs }, (_, i) =>
    logOf(
      input,
      recording.samples.filter((s) => s.seconds >= i * BENCH.logS && s.seconds < (i + 1) * BENCH.logS),
    ),
  );
}
