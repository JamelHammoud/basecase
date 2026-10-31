import type { RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { confirmAction } from '../design-system/confirmStore';
import { useSimulation } from '../sim/useSimulation';
import { useTraining } from '../sim/useTraining';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import type { Posing } from '../utils/usePosing';
import type { Setter } from './types';

interface SimTrainingOptions {
  workspaceId: string;
  parts: ScenePart[];
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  posing: Posing;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

export function useSimTraining({ workspaceId, parts, project, setProject, posing, viewportRef }: SimTrainingOptions) {
  const sim = useSimulation({
    parts,
    project,
    rig: posing.rig,
    pose: posing.pose,
    viewportRef,
    restDeltas: posing.deltas,
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

  return { sim, training, policies, deletePolicy };
}

export type SimTraining = ReturnType<typeof useSimTraining>;
