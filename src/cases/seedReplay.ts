import type { Recording } from '../sim/recorder';
import type { SimModel } from '../sim/mjcfTypes';
import type { Trace } from '../skills/contract';
import type { CaseResult } from './runCase';
import type { Case } from './schema';
import { MISSED } from './caseRuns';
import { tripFrames, type Trip } from './tripFrames';

export interface SeedReplay {
  recording: Recording;
  model: SimModel;
  kase: Case;
  trace: Trace;
  trips: Trip[];
  passed: boolean;
  margin: number;
  seed: number;
}

export async function seedReplay(result: CaseResult, seed: number): Promise<SeedReplay> {
  if (!result.recording) throw new Error(result.refusal);

  const trips = await tripFrames(result.case.task.contract, result.trace);

  if (!result.passed && !trips.length) trips.push({ label: MISSED, frame: Math.max(0, result.frames.length - 1) });

  trips.sort((a, b) => a.frame - b.frame);

  return {
    recording: result.recording,
    model: result.model,
    kase: result.case,
    trace: result.trace,
    trips,
    passed: result.passed,
    margin: result.margin,
    seed,
  };
}
