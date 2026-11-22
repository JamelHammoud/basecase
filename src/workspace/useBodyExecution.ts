import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { robotSnapshot, selectedUnit, subscribeFleetEvents } from '../robot/robotStore';
import { isServoAsk, servoFamily } from '../robot/robotState';
import { sceneRobotChoices } from '../robot/sceneRobot';
import { emulatedSpec } from '../robot/emulatedUnits';
import { wantedMounts } from '../robot/calibrationSession';
import { unitHistories } from '../reality/projectCalibrations';
import { bodyRecordingContext } from '../reality/bodyRecordingEvidence';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import { BODY_EVIDENCE_COUNT } from '../reality/bodyEvidence';
import { executeBodyEvidence } from './bodyExecutionAction';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';
import { RECORDING_STORAGE_FAILURE } from '../../electron/robot/operateRecorder.mjs';
import type { RobotEvent } from '../robot/robotState';
import { bodyProjectUnchanged } from '../reality/bodySource';
import { useBodyProjectChange } from './useBodyProjectChange';

export function useBodyExecution(input: {
  core: WorkspaceCore;
  unit: string;
  reference: BodyEvidenceRef | undefined;
  open: boolean;
  recorded: (id: string) => void;
}) {
  const { core, unit, reference, open } = input;
  const active = useRef<AbortController | null>(null);
  const awaiting = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useLayoutEffect(() => () => active.current?.abort(), [unit, reference, open, core.active, core.parts]);

  const recorded = useEffectEvent((event: RobotEvent) => {
    const manifest = event.manifest as { id?: string; bodyMotion?: { recommendation?: string } } | undefined;

    if (
      event.unit !== unit ||
      event.event !== 'recorded' ||
      !manifest?.id ||
      manifest.bodyMotion?.recommendation !== awaiting.current
    )
      return;

    awaiting.current = null;
    input.recorded(manifest.id);
  });

  useLayoutEffect(() => subscribeFleetEvents(recorded), [unit]);
  useBodyProjectChange(core.project, () => active.current?.abort());

  const run = async () => {
    if (!reference || active.current) return;

    const controller = new AbortController();
    const parts = core.parts;
    const project = core.project;
    const current = () =>
      !controller.signal.aborted &&
      selectedUnit() === unit &&
      core.docs.partsRef.current === parts &&
      bodyProjectUnchanged(core.docs.projectRef.current, project);

    awaiting.current = reference.content;
    active.current = controller;
    setBusy(true);
    setProblem('');

    try {
      const result = await executeBodyEvidence({
        reference,
        signal: controller.signal,
        current,
        prepare: async () => {
          if ((project.bodyEvidence?.length ?? 0) >= BODY_EVIDENCE_COUNT)
            throw new Error('Body analysis evidence exceeds its storage limit.');

          const choices = sceneRobotChoices(project.joints ?? []);
          const choice =
            choices.ok && choices.choices.find((entry) => entry.joints.join('\0') === reference.joints.join('\0'));

          if (!choice) throw new Error('The source changed.');

          const histories = unitHistories(project, unit);
          const model = await core.simTraining.sim.buildModel({ withoutBody: true, calibrations: histories });
          const context = await bodyRecordingContext({
            model,
            project,
            parts,
            unit,
            scene: core.scene.sceneId,
            joints: reference.joints,
          });

          const spec = emulatedSpec({ choice, joints: project.joints ?? [], parts });
          const family = servoFamily(robotSnapshot(unit).spec);

          if (!isServoAsk(spec) || !family) throw new Error('This unit can’t run the saved motion.');

          return { context, spec: { ...spec, family }, mounts: wantedMounts(reference.joints, histories) };
        },
      });

      if (result?.kind === 'refused') setProblem('Enter Test with current joint readings.');

      if (result?.kind === 'storage') setProblem(RECORDING_STORAGE_FAILURE);
    } catch (error) {
      if (!controller.signal.aborted) setProblem(errorMessage(error));
    } finally {
      active.current = null;
      setBusy(false);
    }
  };

  return { pending: busy, problem, run: () => void run(), cancel: () => active.current?.abort() };
}
