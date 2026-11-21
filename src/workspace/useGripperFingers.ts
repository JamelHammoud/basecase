import { useEffect, useRef, useState } from 'react';
import { generateFingers } from '../gripperFingers/generate';
import { readMount } from '../gripperFingers/dimensions';
import { selectedPickGeometryProblem } from '../cases/selectedPick';
import { geometryWorker } from '../three/geometryWorker';
import { platformBridge } from '../utils/platformBridge';
import { errorMessage } from '../utils/errorMessage';
import { rememberParameterDesign } from '../utils/designParameters/verification';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useGripperFingers(core: WorkspaceCore) {
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const selected = core.selection.selectedParts;
  const canPick = core.simTraining.cases.builder.goals.some((goal) => goal.kind === 'pick');
  const selectedTarget = selected.find(
    (part) => !selectedPickGeometryProblem(part) && !core.posing.rig.robots.some((robot) => robot.parts.has(part.id)),
  );
  const reference = selected.find((part) => part.gripperFinger)?.gripperFinger;
  const target = selectedTarget ?? core.parts.find((part) => part.id === reference?.target);
  const canGenerate = canPick && !!selectedTarget && selected.some((part) => !!readMount(part));
  const cancel = () => {
    pending.current?.abort();
    setBusy(false);
  };

  useEffect(() => () => pending.current?.abort(), [core.scene.sceneId]);

  const generate = async (style: 'flat' | 'v') => {
    if (!canGenerate || !selectedTarget || busy) return;

    const controller = new AbortController();
    const document = core.docs.docRef.current;
    const project = core.docs.projectRef.current;
    const current = () =>
      core.docs.docRef.current === document &&
      core.docs.projectRef.current.joints === project.joints &&
      core.docs.projectRef.current.designParameters === project.designParameters &&
      core.docs.projectRef.current.dimensionalRequirements === project.dimensionalRequirements;

    pending.current = controller;
    setBusy(true);

    try {
      const dispatch = performance.now();
      const preparing = generateFingers(
        {
          parts: document.parts,
          joints: project.joints ?? [],
          parameters: project.designParameters,
          target: selectedTarget.id,
          style,
        },
        {
          compile: (code) => platformBridge.renderCad('openscad', code),
          current,
          signal: controller.signal,
          assemble: (job) => geometryWorker.call('fingerAssembly', job),
        },
      );

      performance.measure('fingers:interaction', { start: dispatch, end: performance.now() });

      const result = await preparing;

      if (!current() || controller.signal.aborted) return;

      core.simTraining.sim.stop();
      rememberParameterDesign(result.parts, result.parameters);

      const committing = performance.now();

      core.docs.commitParameters(result.parts, result.parameters, project.dimensionalRequirements, result.joints);
      performance.measure('fingers:commit', { start: committing, end: performance.now() });
      core.setSelectedIds(result.parts.filter((part) => part.gripperFinger?.role === 'finger').map((part) => part.id));
      core.tool.setRightTab('inspector');
      core.studio.setIsRightOpen(true);
      core.parameters.setExpanded(true);
    } catch (error) {
      if (current() && !controller.signal.aborted) core.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  };
  const test = () => {
    if (!target) return;

    const result = core.simTraining.cases.builder.add({
      goal: 'pick',
      world: 'floor',
      pickTarget: target,
      name: `Pick Up ${target.name}`,
    });

    if (!result.ok) return core.showToast(result.problem, { tone: 'error' });

    core.tool.setRightTab('sim');
  };

  return { canGenerate, canTest: canPick && !!target, busy, generate, cancel, test };
}
