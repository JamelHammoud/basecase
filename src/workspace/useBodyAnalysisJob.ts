import { useLayoutEffect, useRef, useState } from 'react';
import { bodyClient } from '../reality/bodyClient';
import { selectedUnit, robotSnapshot } from '../robot/robotStore';
import { withBodyEvidence, type BodyEvidenceRef } from '../reality/bodyEvidence';
import type { BodyAnalysisOutcome } from '../reality/bodyAnalysisTypes';
import type { BodyMotionOutcome } from '../reality/bodyMotionTypes';
import { analyzeBodyEvidence, bodyAnalysisCurrent } from './bodyAnalysisAction';
import { recommendBodyEvidence } from './bodyMotionAction';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';
import type { BodyExperimentEvidence } from '../reality/bodyExperimentTypes';
import type { BodySequenceEvidence } from '../reality/bodyExperimentTypes';
import type { RobotRun } from '../robot/runBuffer';

export interface BodyInvestigationOutcome {
  sequence?: BodySequenceEvidence;
  observedRun?: RobotRun;
  observationUnits?: Array<'rad' | 'm'>;
  experiment?: BodyExperimentEvidence;
  prediction?: BodyMotionOutcome;
  commands?: number;
  samples?: number;
  analysis?: BodyAnalysisOutcome | null;
  motion?: BodyMotionOutcome;
}

export function useBodyAnalysisJob(input: {
  core: WorkspaceCore;
  unit: string;
  selected: string;
  reference: BodyEvidenceRef | undefined;
  open: boolean;
  applicable: boolean;
  report: (outcome: BodyInvestigationOutcome) => void;
}) {
  const { core, unit, selected, reference, open, applicable } = input;
  const state = useRef<{ generation: number; worker: ReturnType<typeof bodyClient> | null }>({
    generation: 0,
    worker: null,
  });
  const [busy, setBusy] = useState<{
    unit: string;
    selected: string;
    parts: WorkspaceCore['parts'];
    project: WorkspaceCore['project'];
  } | null>(null);
  const [problem, setProblem] = useState('');
  const cancel = () => {
    state.current.generation++;
    state.current.worker?.dispose();
    state.current.worker = null;
    setBusy(null);
  };

  useLayoutEffect(() => {
    const active = state.current;

    return () => {
      active.generation++;
      active.worker?.dispose();
      active.worker = null;
    };
  }, [unit, selected, core.parts, core.project, open]);

  const run = async (operation: 'analyze' | 'recommend', parameters: number[] = []) => {
    cancel();
    setProblem('');

    if (!reference) return setProblem('This try has no matching model evidence.');

    if (!applicable) return setProblem('The source changed.');

    const ticket = state.current.generation;
    const client = bodyClient();
    const action = {
      reference,
      current: () =>
        bodyAnalysisCurrent(
          { generation: ticket, unit, parts: core.parts, project: core.project },
          {
            generation: state.current.generation,
            unit: selectedUnit(),
            parts: core.docs.partsRef.current,
            project: core.docs.projectRef.current,
          },
        ),
      retain: (next: BodyEvidenceRef) => core.docs.updateProjectNow((project) => withBodyEvidence(project, next)),
    };

    state.current.worker = client;
    setBusy({ unit, selected, parts: core.parts, project: core.project });

    try {
      const outcome =
        operation === 'analyze'
          ? { analysis: await analyzeBodyEvidence({ ...action, analyze: client.analyze }) }
          : {
              motion:
                (await recommendBodyEvidence({
                  ...action,
                  selected: parameters,
                  recommend: client.recommend,
                  speedRadS: robotSnapshot(unit).link === 'connected' ? 0.5 : undefined,
                })) ?? undefined,
            };

      if (Object.values(outcome).some(Boolean) && state.current.generation === ticket && selectedUnit() === unit)
        input.report(outcome);
    } catch (error) {
      if (state.current.generation === ticket) setProblem(errorMessage(error));
    } finally {
      client.dispose();

      if (state.current.generation === ticket) setBusy(null);
    }
  };

  return {
    pending:
      open &&
      busy?.unit === unit &&
      busy.selected === selected &&
      busy.parts === core.parts &&
      busy.project === core.project,
    problem,
    cancel,
    clear: () => setProblem(''),
    run: (operation: 'analyze' | 'recommend', parameters?: number[]) => void run(operation, parameters),
  };
}
