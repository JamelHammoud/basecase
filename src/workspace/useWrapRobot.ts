import { prepareParts } from '../three/partMesh/prepare';
import { wrapInWorker } from '../wrap/wrapClient';
import type { RobotJoint } from '../types/robotics';
import { applyWrap, cachedWrapTarget, wrapPlan, type WrapEdit, type WrapTarget } from '../wrap/wrapPlan';
import { attempt } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';

const FLOOR_Y = 0;
const NO_JOINTS: RobotJoint[] = [];

export function useWrapRobot(core: WorkspaceCore) {
  'use memo';

  const { docs, viewportRef, parts, project, selectedIds, setSelectedIds, showToast, toasts } = core;
  const { partsRef, projectRef, commitParts, updateProjectNow } = docs;

  const wrap = async (target: WrapTarget): Promise<WrapEdit | string> => {
    const viewport = viewportRef.current;

    if (!viewport) return 'The canvas is closed.';

    showToast(`Wrapping ${target.robot.name}…`, { tone: 'progress' });

    const plan = wrapPlan(target);
    const scene = viewport.restShapes([target.mesh.id, ...plan.bodies.map((b) => b.id)]);
    const request = { mesh: target.mesh.id, bodies: plan.bodies, joints: plan.joints, floorY: FLOOR_Y };
    const outcome = await attempt(() => wrapInWorker(scene, request));

    if (!outcome.ok || !outcome.value.shells.length) {
      showToast(`Couldn’t wrap ${target.robot.name}`, { tone: 'error' });

      return outcome.ok ? 'The mesh doesn’t reach any of the robot’s links.' : errorMessage(outcome.error);
    }

    const edit = applyWrap(
      target,
      { parts: partsRef.current, joints: projectRef.current.joints ?? [] },
      outcome.value.shells,
    );

    await prepareParts(edit.shells);
    commitParts(() => edit.parts);
    updateProjectNow((p) => ({ ...p, joints: edit.joints }));
    setSelectedIds(edit.shells.map((s) => s.id));
    toasts.dismissToast();

    return edit;
  };

  const wrapSelected = () => {
    const target = cachedWrapTarget(partsRef.current, projectRef.current.joints ?? NO_JOINTS, selectedIds);

    if (target) void wrap(target);
  };

  const canWrap = () => cachedWrapTarget(parts, project.joints ?? NO_JOINTS, selectedIds) !== null;

  return { canWrap, wrapSelected, wrap };
}

export type WrapRobot = ReturnType<typeof useWrapRobot>;
