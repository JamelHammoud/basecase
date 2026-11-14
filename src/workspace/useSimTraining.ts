import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { confirmAction } from '../design-system/confirmStore';
import { modelFingerprints } from '../sim/policyFreshness';
import type { VelocitySource } from '../sim/useDrive';
import { useSimulation } from '../sim/useSimulation';
import { useTraining } from '../sim/useTraining';
import { platformBridge } from '../utils/platformBridge';
import type { PolicyRecord } from '../types/robotics';
import type { Posing } from '../utils/usePosing';
import type { ShowToast, StudioShared } from './types';
import { useCases } from './useCases';
import { useRoutines } from './useRoutines';
import { useShareRobot } from './useShareRobot';
import { useSkills } from './useSkills';
import type { SceneDocument } from './useSceneDocument';

interface SimTrainingOptions {
  workspaceId: string;
  scene: { sceneId: string; sceneName: string };
  docs: SceneDocument;
  posing: Posing;
  viewportRef: RefObject<Viewport3DHandle | null>;
  showToast: ShowToast;
  studio: Pick<StudioShared, 'openSettings' | 'robotsBeside'>;
}

function withPolicy(policies: PolicyRecord[], record: PolicyRecord, replaces: string | null): PolicyRecord[] {
  const at = policies.findIndex((x) => x.id === replaces);

  if (at < 0) return [...policies.filter((x) => x.id !== record.id), record];

  return policies.map((x, i) => (i === at ? record : x)).filter((x, i) => i === at || x.id !== record.id);
}

export function useSimTraining(options: SimTrainingOptions) {
  const { workspaceId, scene, docs, posing, viewportRef, showToast, studio } = options;
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
    fingerprints: modelFingerprints(skills.model),
    onPolicy: (record, replaces) => {
      setProject((p) => ({ ...p, policies: withPolicy(p.policies ?? [], record, replaces) }));

      if (replaces && replaces !== record.id) void platformBridge.deletePolicy(replaces);
    },
  });

  const removePolicy = (id: string) => {
    setProject((p) => ({ ...p, policies: (p.policies ?? []).filter((x) => x.id !== id) }));
    void platformBridge.deletePolicy(id);
  };

  const deletePolicy = (id: string) => {
    const policy = policies.find((p) => p.id === id);

    if (!policy) return;

    confirmAction({ title: `Delete ${policy.name}?`, onConfirm: () => removePolicy(id) });
  };

  const cases = useCases({
    parts,
    project,
    setProject,
    rig: posing.rig,
    sim,
    showToast,
    openAccounts: () => studio.openSettings('accounts'),
    sceneId: scene.sceneId,
    partners: () => studio.robotsBeside(workspaceId),
    skills: skills.routineSkills,
    skillTraining: skills,
    viewportRef,
    caseRobot: async () => {
      const viewport = viewportRef.current;

      if (!viewport) return null;

      await viewport.meshesReady();

      return {
        parts: docs.partsRef.current,
        project: docs.projectRef.current,
        measures: await viewport.measureParts(),
        partTriangles: viewport.partTriangles,
      };
    },
  });
  const share = useShareRobot({
    scene: { sceneId: scene.sceneId, sceneName: scene.sceneName },
    parts,
    project,
    kase: cases.active,
    hasRobot: cases.hasRobot,
    sim,
    training,
    skills,
    viewportRef,
    showToast,
    openAccounts: () => studio.openSettings('accounts'),
  });
  const routines = useRoutines({
    parts,
    project,
    projectRef,
    sim,
    commitParts,
    updateProjectNow,
    showToast,
    skills: skills.routineSkills,
    trainHandoff: skills.trainHandoff,
  });

  return { sim, training, policies, deletePolicy, cases, routines, skills, share };
}

export type SimTraining = ReturnType<typeof useSimTraining>;
