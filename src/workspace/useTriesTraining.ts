import { useState } from 'react';
import { filmImage } from '../cases/filmImage';
import type { Case } from '../cases/schema';
import { passedTry, type TryRecord } from '../cases/tries';
import { canTrain } from '../datasets/demos';
import { usableTries } from '../datasets/usableTries';
import type { Simulation } from '../sim/useSimulation';
import type { SkillsRuntime, TriesOutcome } from '../skills/skillsRuntime';
import { TRIES_JOINT_NOISE_DEG, TRIES_RUNS, TRIES_TO_TRAIN, triesJob } from '../skills/triesTraining';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { caseVerdict, type CaseRobotInput, type CaseVerdict } from './caseChecks';
import type { ShowToast } from './types';
import { EARLIER_TRIES } from './useDatasetExport';

export interface TriesResult {
  caseId: string;
  passes: number;
  runs: number;
  kept: boolean;
  film: string | null;
}

interface TriesTrainingOptions {
  sim: Simulation;
  active: Case | null;
  tries: TryRecord[];
  skills: { runtime: SkillsRuntime; busy: boolean };
  caseRobot: () => Promise<CaseRobotInput | null>;
  showToast: ShowToast;
}

export interface TriesTraining {
  shown: boolean;
  ready: boolean;
  training: boolean;
  result: TriesResult | null;
  train: () => void;
}

async function worstFilm(verdict: CaseVerdict | null): Promise<string | null> {
  const runs = verdict?.runs;

  if (!verdict || !runs || runs.worstSeed === null || runs.passes === runs.runs) return null;

  const shot = await verdict.film(runs.worstSeed).catch(() => null);

  return shot ? filmImage(shot).catch(() => null) : null;
}

export function useTriesTraining(options: TriesTrainingOptions): TriesTraining {
  const { sim, active, tries, caseRobot, showToast } = options;
  const { runtime, busy } = options.skills;
  const [training, setTraining] = useState<string | null>(null);
  const [result, setResult] = useState<TriesResult | null>(null);
  const passed = tries.filter(passedTry);
  const shown = !IS_WEB_DEMO && !!active && passed.length >= TRIES_TO_TRAIN;

  const finish = async (kase: Case, outcome: TriesOutcome, verdict: CaseVerdict | null) => {
    const { runs, kept, problem } = outcome;

    if (problem) showToast(problem, { tone: 'error' });

    const film = runs && !runs.refusal ? await worstFilm(verdict) : null;

    setResult(runs && !runs.refusal ? { caseId: kase.id, passes: runs.passes, runs: runs.runs, kept, film } : null);
    setTraining(null);
  };

  const start = async (kase: Case) => {
    const robot = await caseRobot();
    const model = await sim.buildModel();
    const { usable } = await usableTries(passed, model, { accepts: canTrain });

    if (!robot || usable.length < TRIES_TO_TRAIN) {
      setTraining(null);
      showToast(EARLIER_TRIES, { tone: 'error' });

      return;
    }

    let verdict: CaseVerdict | null = null;
    const control = { jointNoiseDeg: TRIES_JOINT_NOISE_DEG };
    const refused = runtime.learnFromTries({
      model,
      kase,
      job: triesJob(
        model,
        kase,
        usable.map((u) => u.recording),
      ),
      judge: async (policy) => {
        verdict = await caseVerdict(robot, kase, TRIES_RUNS, { ...control, policy });

        return { runs: verdict.runs, robotModel: verdict.modelHash };
      },
      done: (outcome) => void finish(kase, outcome, verdict),
    });

    if (refused) setTraining(null);
  };

  const train = () => {
    if (!active || training || busy) return;

    setTraining(active.id);
    setResult(null);
    start(active).catch(() => setTraining(null));
  };

  return {
    shown,
    ready: shown && !training && !busy,
    training: !!active && training === active.id,
    result: result && result.caseId === active?.id ? result : null,
    train,
  };
}
