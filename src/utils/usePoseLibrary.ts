import { useCallback } from 'react';
import type { ProjectSettings, RobotAnimation, RobotPose, RobotPoseState } from '../types/robotics';
import { robotPose, withRobotPose, type Rig } from './kinematics';
import { newId, robotKeyFor } from './posingHelpers';
import type { Playback } from './usePosePlayback';

interface LibraryOptions {
  projectRef: React.MutableRefObject<ProjectSettings>;
  rigRef: React.RefObject<Rig>;
  update: (patch: Partial<ProjectSettings>) => void;
}

interface PoseLibraryOptions extends LibraryOptions {
  groupKeyRef: React.RefObject<string | null>;
  setPose: (next: RobotPoseState | null) => void;
}

interface AnimationLibraryOptions extends LibraryOptions {
  playbackRef: React.RefObject<Playback | null>;
  setPlayback: (next: Playback | null) => void;
}

export function usePoseLibrary({ projectRef, rigRef, groupKeyRef, update, setPose }: PoseLibraryOptions) {
  const savePose = useCallback(
    (name: string) => {
      const key = groupKeyRef.current ?? rigRef.current.robots[0]?.key;
      const local = key ? robotPose(rigRef.current, projectRef.current.pose, key) : { values: {} };
      const p: RobotPose = { id: newId('pose'), name, ...local, robot: key };

      update({ poses: [...(projectRef.current.poses ?? []), p] });

      return p;
    },
    [groupKeyRef, rigRef, projectRef, update],
  );
  const applySavedPose = useCallback(
    (id: string) => {
      const p = projectRef.current.poses?.find((x) => x.id === id);

      if (!p) return;

      const rig = rigRef.current;

      setPose(
        withRobotPose(rig, projectRef.current.pose, robotKeyFor(rig, p), { values: { ...p.values }, root: p.root }),
      );
    },
    [projectRef, rigRef, setPose],
  );
  const renamePose = useCallback(
    (id: string, name: string) =>
      update({ poses: (projectRef.current.poses ?? []).map((p) => (p.id === id ? { ...p, name } : p)) }),
    [projectRef, update],
  );
  const deletePose = useCallback(
    (id: string) => update({ poses: (projectRef.current.poses ?? []).filter((p) => p.id !== id) }),
    [projectRef, update],
  );

  return { savePose, applySavedPose, renamePose, deletePose };
}

export function useAnimationLibrary({ projectRef, rigRef, playbackRef, setPlayback, update }: AnimationLibraryOptions) {
  const addAnimation = useCallback(
    (anim: RobotAnimation) => {
      const rig = rigRef.current;
      const list = projectRef.current.animations ?? [];
      const robotKey = anim.robot ?? robotKeyFor(rig, anim);
      const existing = list.find((a) => a.name === anim.name && robotKeyFor(rig, a) === robotKey);
      const made = { ...anim, robot: robotKey, id: anim.id || existing?.id || newId('anim') };

      update({ animations: existing ? list.map((a) => (a.id === existing.id ? made : a)) : [...list, made] });

      return made;
    },
    [projectRef, rigRef, update],
  );
  const renameAnimation = useCallback(
    (id: string, name: string) =>
      update({ animations: (projectRef.current.animations ?? []).map((a) => (a.id === id ? { ...a, name } : a)) }),
    [projectRef, update],
  );
  const deleteAnimation = useCallback(
    (id: string) => {
      if (playbackRef.current?.id === id) setPlayback(null);

      update({ animations: (projectRef.current.animations ?? []).filter((a) => a.id !== id) });
    },
    [playbackRef, projectRef, setPlayback, update],
  );
  const setAnimationLoop = useCallback(
    (id: string, loop: boolean) =>
      update({ animations: (projectRef.current.animations ?? []).map((a) => (a.id === id ? { ...a, loop } : a)) }),
    [projectRef, update],
  );

  return { addAnimation, renameAnimation, deleteAnimation, setAnimationLoop };
}
