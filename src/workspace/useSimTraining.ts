import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { confirmAction } from '../design-system/confirmStore';
import type { VelocitySource } from '../sim/useDrive';
import { useSimulation } from '../sim/useSimulation';
import { useTraining } from '../sim/useTraining';
import { platformBridge } from '../utils/platformBridge';
import type { Posing } from '../utils/usePosing';
import type { ShowToast } from './types';
import { useCases } from './useCases';
import { useRoutines } from './useRoutines';
import { useSkills } from './useSkills';
import type { SceneDocument } from './useSceneDocument';

interface SimTrainingOptions {
  workspaceId: string;
  docs: SceneDocument;
  posing: Posing;
  viewportRef: RefObject<Viewport3DHandle | null>;
  showToast: ShowToast;
}

export function useSimTraining({ workspaceId, docs, posing, viewportRef, showToast }: SimTrainingOptions) {
  const { parts, project, projectRef, setProject, commitParts, updateProjectNow } = docs;
  const velocity = useRef<VelocitySource | null>(null);
  const sim = useSimulation({
    parts,
    project,
    rig: posing.rig,
    pose: posing.pose,
    viewportRef,
    restDeltas: posing.deltas,
    velocity,
  });
  const skills = useSkills({ workspaceId, sim, project, setProject, rig: posing.rig, parts });

  useLayoutEffect(() => {
    velocity.current = skills.velocity;
  });

  const policies = project.policies ?? [];
  const training = useTraining({
    workspaceId,
    buildModel: sim.buildModel,
    robotKey: posing.robot?.group.key ?? posing.rig.robots[0]?.key ?? null,
    policies,
    onPolicy: (record) =>
      setProject((p) => ({ ...p, policies: [...(p.policies ?? []).filter((x) => x.id !== record.id), record] })),
  });

  const removePolicy = (id: string) => {
    setProject((p) => ({ ...p, policies: (p.policies ?? []).filter((x) => x.id !== id) }));
    void platformBridge.deletePolicy(id);
  };

  const deletePolicy = (id: string) => {
    const policy = policies.find((p) => p.id === id);

    if (!policy) return;

    confirmAction({
      title: `Delete ${policy.name}?`,
      body: 'You can’t undo this.',
      onConfirm: () => removePolicy(id),
    });
  };

  const cases = useCases({ parts, project, setProject, rig: posing.rig, sim });
  const routines = useRoutines({ parts, project, projectRef, sim, commitParts, updateProjectNow, showToast });

  return { sim, training, policies, deletePolicy, cases, routines, skills };
}

export type SimTraining = ReturnType<typeof useSimTraining>;
