import type { SimModel } from '../../sim/mjcfTypes';
import type { Recording } from '../../sim/recorder';
import type { ScenePart } from '../../types/robotics';
import type { Rig } from '../../utils/kinematics';
import type { Contract } from '../contract';
import type { GoalJudge } from '../goalJudge';
import { boundEffector, robotFacts } from '../robotFit';
import { scaledToReach } from '../scale';
import { caseSlots, type Case } from '../schema';
import { caseProbeReader, caseProbeWorld, trySignals } from '../tries';
import type { CaseConsole } from './format';
import { goalMarks, recordedTrack, type RecordedTrack } from './recordedSignals';

export interface CaseScene {
  kase: Case;
  model: SimModel;
  rig: Rig;
  parts: ScenePart[];
}

export function caseScoring({ kase, model, rig, parts }: CaseScene) {
  const facts = robotFacts(rig, parts);
  const scaled = scaledToReach(kase, facts.reachMm, facts.anchor);
  const scoring = { kase: scaled, model, effector: boundEffector(caseSlots(scaled)[0].binding, facts, rig), rig };

  return {
    scoring,
    contract: scaled.task.contract,
    reader: caseProbeReader(scoring),
    world: caseProbeWorld(scoring),
  };
}

export interface ConsoleTrackInput {
  kase: Case | null;
  model: SimModel;
  rig: Rig;
  parts: ScenePart[];
  recording: Recording;
  efforts: readonly Float32Array[] | null;
  caseConsole: CaseConsole;
  cameras: readonly string[];
  judge: (contract: Contract) => GoalJudge;
}

export async function consoleTrack(input: ConsoleTrackInput): Promise<RecordedTrack> {
  const { kase, model, rig, parts, recording, efforts, caseConsole, cameras } = input;
  const base = { recording, model, efforts, inputs: caseConsole.input, cameras, signals: caseConsole.signals };

  if (!kase) return recordedTrack(base);

  const { scoring, contract, reader, world } = caseScoring({ kase, model, rig, parts });
  const judge = input.judge(contract);

  try {
    const goal = await goalMarks(judge, trySignals({ ...scoring, recording }));

    return recordedTrack({ ...base, probes: { reader, world }, goal });
  } finally {
    judge.dispose();
  }
}
