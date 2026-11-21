import type { Case } from '../cases/schema';
import { stageCase } from '../cases/caseCast';
import type { SlotRobot } from '../cases/slots';
import type { TryRecord } from '../cases/tries';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { CaseTry } from './useCaseTry';
import type { TryTimeline } from './useTryTimeline';
import type { MadeTry } from './useStoredTries';

interface Options {
  timeline: TryTimeline;
  attempt: CaseTry;
  sim: Simulation;
  cases: Case[];
  rig: Rig;
  parts: ScenePart[];
  partners: () => SlotRobot[];
  activate: (id: string) => void;
}

export function caseBranchActions({ timeline, attempt, sim, cases, rig, parts, partners, activate }: Options) {
  return {
    available:
      timeline.open &&
      !timeline.comparison.active &&
      attempt.phase === 'idle' &&
      !!timeline.scene &&
      sim.checkpoints.some((point) => point.frame === timeline.frame),
    points: sim.checkpoints,
    run: async () => {
      const input = timeline.branchSource();
      const source = input && cases.find((kase) => kase.id === input.source.caseId);

      if (!input || !source || attempt.phase !== 'idle') return false;

      const kase = stageCase(source, { rig, parts }, partners()).kase;

      return attempt.branch({
        ...input,
        scoring: { ...input.scoring, kase },
        started: () => {
          activate(input.source.caseId);
          input.started();
        },
      });
    },
  };
}

export const caseTryCallbacks = (
  scope: unknown,
  keep: (made: MadeTry[], current: () => boolean) => Promise<void>,
  onTry: (record: TryRecord, recording: Recording, input: string | null) => Promise<void>,
  onRefuse: (message: string) => void,
) => ({
  onTry,
  onRefuse,
  branchScope: scope,
  onBranchTry: (record: TryRecord, recording: Recording, current: () => boolean) =>
    keep([{ record, recording, input: null }], current),
});
