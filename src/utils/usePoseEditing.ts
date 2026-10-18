import { useCallback, useMemo, useRef, useState } from 'react';
import type { ProjectSettings, RobotPoseState, TransformMode } from '../types/robotics';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { clampJoint, forwardKinematics, isMovable, isRestPose, poseDeltas, posedAxis, type Rig } from './kinematics';
import { selectionJoint } from './posingHelpers';
import type { Playback } from './usePosePlayback';
import { useLatestRef } from './useLatestRef';

interface PoseEditingOptions {
  projectRef: React.MutableRefObject<ProjectSettings>;
  rigRef: React.RefObject<Rig>;
  partIdsRef: React.RefObject<string[]>;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  playbackRef: React.RefObject<Playback | null>;
  setPlayback: React.Dispatch<React.SetStateAction<Playback | null>>;
  update: (patch: Partial<ProjectSettings>) => void;
  onPoseEdit?: (before: RobotPoseState | undefined) => void;
}

export function usePoseEditing({
  projectRef,
  rigRef,
  partIdsRef,
  viewportRef,
  playbackRef,
  setPlayback,
  update,
  onPoseEdit,
}: PoseEditingOptions) {
  const onPoseEditRef = useLatestRef(onPoseEdit);

  const applyPoseState = useCallback(
    (next: RobotPoseState | null | undefined, record: boolean) => {
      if (playbackRef.current?.playing) setPlayback((p) => (p ? { ...p, playing: false } : p));

      if (record) onPoseEditRef.current?.(projectRef.current.pose);

      update({ pose: next && !isRestPose(next) ? next : undefined });
      viewportRef.current?.setPose(poseDeltas(rigRef.current, next, partIdsRef.current));
    },
    [playbackRef, setPlayback, onPoseEditRef, projectRef, update, viewportRef, rigRef, partIdsRef],
  );
  const setPose = useCallback((next: RobotPoseState | null) => applyPoseState(next, true), [applyPoseState]);
  const restorePose = useCallback((next: RobotPoseState | undefined) => applyPoseState(next, false), [applyPoseState]);

  const setJointValue = useCallback(
    (id: string, value: number) => {
      const j = rigRef.current.byId.get(id);

      if (!j) return;

      const cur = projectRef.current.pose;

      setPose({ ...cur, values: { ...cur?.values, [id]: clampJoint(j, value) } });
    },
    [rigRef, projectRef, setPose],
  );

  const dragBase = useRef(0);
  const onPoseJoint = useCallback(
    (id: string, delta: number, phase: 'start' | 'move' | 'end') => {
      if (phase === 'start') dragBase.current = projectRef.current.pose?.values[id] ?? 0;

      setJointValue(id, Math.round((dragBase.current + delta) * 10) / 10);
    },
    [projectRef, setJointValue],
  );

  return { setPose, restorePose, setJointValue, onPoseJoint };
}

interface ActiveJointOptions {
  rig: Rig;
  pose: RobotPoseState | undefined;
  selectedIds: string[];
  transformMode: TransformMode;
}

export function useActiveJoint({ rig, pose, selectedIds, transformMode }: ActiveJointOptions) {
  const [activeJointId, setActiveJointId] = useState<string | null>(
    () => selectionJoint(rig, selectedIds, transformMode) ?? null,
  );
  const [seen, setSeen] = useState({ rig, selectedIds, transformMode });

  if (seen.rig !== rig || seen.selectedIds !== selectedIds || seen.transformMode !== transformMode) {
    const next = selectionJoint(rig, selectedIds, transformMode);

    setSeen({ rig, selectedIds, transformMode });
    setActiveJointId((cur) => (next === undefined ? cur : next));
  }

  const posed = useMemo(() => forwardKinematics(rig, pose), [rig, pose]);
  const poseJoint = useMemo(() => {
    const j = activeJointId ? rig.byId.get(activeJointId) : undefined;

    if (!j || !isMovable(j)) return null;

    const a = posedAxis(rig, posed, j);

    return { id: j.id, type: j.type as 'revolute' | 'prismatic', origin: a.origin, axis: a.axis };
  }, [rig, posed, activeJointId]);
  const selectJoint = useCallback((id: string | null) => setActiveJointId(id), []);

  return { activeJointId, selectJoint, poseJoint };
}
