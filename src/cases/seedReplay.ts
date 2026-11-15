import type { MainModule } from '@mujoco/mujoco';
import type { Recording } from '../sim/recorder';
import { recordedEfforts, type RecordedEfforts } from '../sim/recordedFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { Trace } from '../skills/contract';
import { startEngine, type CaseResult } from './runCase';
import type { Case } from './schema';
import { MISSED } from './caseRuns';
import { tripFrames, type Trip } from './tripFrames';

export interface SeedReplay {
  recording: Recording;
  efforts: RecordedEfforts;
  model: SimModel;
  kase: Case;
  trace: Trace;
  trips: Trip[];
  passed: boolean;
  margin: number;
  seed: number;
}

export async function seedReplay(mj: MainModule, result: CaseResult, seed: number): Promise<SeedReplay> {
  if (!result.recording) throw new Error(result.refusal);

  const trips = await tripFrames(result.case.task.contract, result.trace);

  if (!result.passed && !trips.length) trips.push({ label: MISSED, frame: Math.max(0, result.frames.length - 1) });

  trips.sort((a, b) => a.frame - b.frame);

  const { engine, dispose } = startEngine(mj, result.model, { controller: { kind: 'hold' }, seed });
  let efforts: RecordedEfforts;

  try {
    efforts = recordedEfforts(mj, engine, result.recording);
  } finally {
    dispose();
  }

  return {
    recording: result.recording,
    efforts,
    model: result.model,
    kase: result.case,
    trace: result.trace,
    trips,
    passed: result.passed,
    margin: result.margin,
    seed,
  };
}
