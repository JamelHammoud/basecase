import { useLayoutEffect, useRef, useState } from 'react';
import { bodyClient } from '../reality/bodyClient';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import { withBodyEvidence } from '../reality/bodyEvidence';
import type { BodySequenceEvidence } from '../reality/bodyExperimentTypes';
import type { WorkspaceCore } from './useWorkspaceCore';
import { selectedUnit } from '../robot/robotStore';
import { runBodySequenceEvidence } from './bodySequenceAction';
import { errorMessage } from '../utils/errorMessage';

export function useBodySequence(input: {
  core: WorkspaceCore;
  unit: string;
  reference: BodyEvidenceRef | undefined;
  open: boolean;
  report: (evidence: BodySequenceEvidence) => void;
}) {
  const { core, unit, reference, open } = input;
  const active = useRef<{ controller: AbortController; project: WorkspaceCore['project'] } | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const recording = reference?.recording;
  const cancel = () => active.current?.controller.abort();

  useLayoutEffect(() => () => active.current?.controller.abort(), [unit, recording, open, core.active, core.parts]);
  useLayoutEffect(() => {
    if (active.current && active.current.project !== core.project) active.current.controller.abort();
  }, [core.project]);

  const run = async (selected: number[]) => {
    if (!reference || active.current) return;

    const controller = new AbortController();
    const worker = bodyClient();
    const run = { controller, project: core.docs.projectRef.current };
    const parts = core.parts;
    const current = () =>
      active.current === run &&
      selectedUnit() === unit &&
      core.docs.partsRef.current === parts &&
      core.docs.projectRef.current === run.project;

    active.current = run;
    setPending(true);
    setProblem('');

    try {
      await runBodySequenceEvidence({
        reference,
        selected,
        worker,
        signal: controller.signal,
        current,
        retain: (next, evidence) => {
          core.docs.updateProjectNow((project) => {
            const updated = withBodyEvidence(project, next);

            run.project = updated;

            return updated;
          });
          input.report(evidence);
        },
      });
    } catch (error) {
      if (!controller.signal.aborted) setProblem(errorMessage(error));
    } finally {
      worker.dispose();

      if (active.current === run) active.current = null;

      setPending(false);
    }
  };

  return { pending, problem, run: (selected: number[]) => void run(selected), cancel };
}
