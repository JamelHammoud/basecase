import { useState } from 'react';
import { filmImage } from '../cases/filmImage';
import type { Case } from '../cases/schema';
import type { Dataset } from '../datasets/datasetFile';
import { canTrain } from '../datasets/demos';
import { splitOf } from '../datasets/datasetSplit';
import { usableTries } from '../datasets/usableTries';
import type { Simulation } from '../sim/useSimulation';
import type { SkillsRuntime } from '../skills/skillsRuntime';
import type { TriesOutcome } from '../skills/triesRun';
import { TRIES_JOINT_NOISE_DEG, TRIES_RUNS, TRIES_TO_TRAIN, triesJob } from '../skills/triesTraining';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { caseVerdict, type CaseRobotInput, type CaseVerdict } from './caseChecks';
import type { ShowToast } from './types';
import { FITTING_TRIES } from './useDatasetExport';
import type { DatasetRecords } from './useDatasetRecords';

export interface TriesResult {
  datasetId: string;
  passes: number;
  runs: number;
  kept: boolean;
  film: string | null;
}

interface TriesTrainingOptions {
  sim: Simulation;
  cases: Case[];
  records: DatasetRecords;
  skills: { runtime: SkillsRuntime; busy: boolean };
  caseRobot: () => Promise<CaseRobotInput | null>;
  showToast: ShowToast;
}

export interface TriesTraining {
  canTrain: boolean;
  busy: boolean;
  training: string | null;
  resultFor: (dataset: Dataset) => TriesResult | null;
  train: (dataset: Dataset, kase: Case) => void;
}

async function worstFilm(verdict: CaseVerdict | null): Promise<string | null> {
  const runs = verdict?.runs;

  if (!verdict || !runs || runs.worstSeed === null || runs.passes === runs.runs) return null;

  const shot = await verdict.film(runs.worstSeed).catch(() => null);

  return shot ? filmImage(shot).catch(() => null) : null;
}

export function useTriesTraining(options: TriesTrainingOptions): TriesTraining {
  const { sim, records, caseRobot, showToast } = options;
  const { runtime, busy } = options.skills;
  const [training, setTraining] = useState<string | null>(null);
  const [result, setResult] = useState<TriesResult | null>(null);

  const finish = async (dataset: Dataset, outcome: TriesOutcome, verdict: CaseVerdict | null) => {
    const { runs, kept, problem } = outcome;

    if (problem) showToast(problem, { tone: 'error' });

    const film = runs && !runs.refusal ? await worstFilm(verdict) : null;
    const shown = runs && !runs.refusal;

    setResult(shown ? { datasetId: dataset.id, passes: runs.passes, runs: runs.runs, kept, film } : null);
    setTraining(null);
  };

  const start = async (dataset: Dataset, kase: Case) => {
    const robot = await caseRobot();
    const model = await sim.buildModel();
    const passed = records.of(dataset).filter((t) => t.passed);
    const { usable, modelHash } = await usableTries(passed, model, { accepts: canTrain });

    if (!robot || usable.length < TRIES_TO_TRAIN) {
      setTraining(null);
      showToast(FITTING_TRIES, { tone: 'error' });

      return;
    }

    await records.freeze(dataset, modelHash);

    const byId = new Map(usable.map((u) => [u.record.id, u.recording]));
    const ordered = splitOf([...byId.keys()], dataset.seed).order.map((id) => byId.get(id)!);
    let verdict: CaseVerdict | null = null;
    const control = { jointNoiseDeg: TRIES_JOINT_NOISE_DEG };
    const refused = runtime.learnFromTries({
      model,
      kase,
      job: triesJob(model, kase, ordered),
      judge: async (policy) => {
        verdict = await caseVerdict(robot, kase, TRIES_RUNS, { ...control, policy });

        return { runs: verdict.runs, robotModel: verdict.modelHash };
      },
      done: (outcome) => void finish(dataset, outcome, verdict),
    });

    if (refused) setTraining(null);
  };

  return {
    canTrain: !IS_WEB_DEMO,
    busy: !!training || busy,
    training,
    resultFor: (dataset) => (result?.datasetId === dataset.id ? result : null),
    train: (dataset, kase) => {
      if (IS_WEB_DEMO || training || busy) return;

      setTraining(dataset.id);
      setResult(null);
      start(dataset, kase).catch(() => setTraining(null));
    },
  };
}
