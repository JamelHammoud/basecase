import { useCallback, useMemo } from 'react';
import type * as THREE from 'three';
import type {
  ProjectSettings,
  RobotAnimation,
  RobotPose,
  RobotPoseState,
  ScenePart,
  TransformMode,
} from '../types/robotics';
import type { Viewport3DHandle } from '../components/Viewport3D';
import {
  isMovable,
  linkParts,
  poseDeltas,
  robotOfParts,
  robotPose,
  robotRig,
  withRobotPose,
  type RobotGroup,
  type Rig,
  type V3,
} from './kinematics';
import { defaultPhases, goalParts, type PointOf } from './animation';
import { robotKeyFor } from './posingHelpers';
import { useActiveJoint, usePoseEditing } from './usePoseEditing';
import { useAnimationLibrary, usePoseLibrary } from './usePoseLibrary';
import { usePosePlayback, type Playback } from './usePosePlayback';
import { useLatestRef } from './useLatestRef';
import { useFastenerRig } from './useFastenerRig';

export type { Playback } from './usePosePlayback';

export interface Posing {
  rig: Rig;
  hasRig: boolean;
  pose: RobotPoseState | undefined;
  robot: { group: RobotGroup; rig: Rig; pose: RobotPoseState } | null;
  poses: RobotPose[];
  animations: RobotAnimation[];
  setRobotPose: (local: RobotPoseState) => void;
  deltas: Map<string, THREE.Matrix4>;
  poseJoint: { id: string; type: 'revolute' | 'prismatic'; origin: THREE.Vector3; axis: THREE.Vector3 } | null;
  activeJointId: string | null;
  selectJoint: (id: string | null) => void;
  setJointValue: (id: string, value: number) => void;
  setPose: (next: RobotPoseState | null) => void;
  restorePose: (next: RobotPoseState | undefined) => void;
  onPoseJoint: (id: string, delta: number, phase: 'start' | 'move' | 'end') => void;
  savePose: (name: string) => RobotPose;
  applySavedPose: (id: string) => void;
  renamePose: (id: string, name: string) => void;
  deletePose: (id: string) => void;
  addAnimation: (anim: RobotAnimation) => RobotAnimation;
  renameAnimation: (id: string, name: string) => void;
  deleteAnimation: (id: string) => void;
  setAnimationLoop: (id: string, loop: boolean) => void;
  playback: Playback | null;
  play: (id: string, from?: number) => void;
  pause: () => void;
  scrub: (id: string, t: number) => void;
  pointOf: PointOf;
}

interface PosingOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  projectRef: React.MutableRefObject<ProjectSettings>;
  setProject: (p: ProjectSettings) => void;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  transformMode: TransformMode;
  onPoseEdit?: (before: RobotPoseState | undefined) => void;
}

function useSelectedRobot(rig: Rig, pose: RobotPoseState | undefined, selectedIds: string[]) {
  const group = useMemo(() => robotOfParts(rig, selectedIds), [rig, selectedIds]);
  const groupKey = group?.key ?? null;
  const oneRig = useMemo(() => (groupKey ? robotRig(rig, groupKey) : null), [rig, groupKey]);
  const robot = useMemo(
    () => (group && oneRig ? { group, rig: oneRig, pose: robotPose(rig, pose, group.key) } : null),
    [group, oneRig, rig, pose],
  );

  return { groupKey, robot };
}

function usePointOf(rigRef: React.RefObject<Rig>, viewportRef: React.RefObject<Viewport3DHandle | null>): PointOf {
  return useCallback(
    (id, where) => {
      const ids = goalParts(rigRef.current, id);
      const b = viewportRef.current?.restBounds(ids.length ? ids : [id]);

      if (!b) return null;

      const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

      return where === 'bottom' ? [c[0], b.min[1], c[2]] : c;
    },
    [rigRef, viewportRef],
  );
}

export function usePosing({
  parts,
  project,
  projectRef,
  setProject,
  viewportRef,
  selectedIds,
  transformMode,
  onPoseEdit,
}: PosingOptions): Posing {
  const joints = project.joints;
  const rig = useFastenerRig(joints, parts, viewportRef);
  const rigRef = useLatestRef(rig);
  const hasRig = rig.joints.some(isMovable);
  const pose = project.pose;
  const partIds = useMemo(() => parts.map((p) => p.id), [parts]);
  const partIdsRef = useLatestRef(partIds);
  const deltas = useMemo(() => poseDeltas(rig, pose, partIds), [rig, pose, partIds]);

  const update = useCallback(
    (patch: Partial<ProjectSettings>) => {
      const next = { ...projectRef.current, ...patch };

      projectRef.current = next;
      setProject(next);
    },
    [projectRef, setProject],
  );
  const preview = useCallback(
    (state: RobotPoseState) => {
      viewportRef.current?.setPose(poseDeltas(rigRef.current, state, partIdsRef.current));
    },
    [viewportRef, rigRef, partIdsRef],
  );

  const { playback, setPlayback, playbackRef, play, pause, scrub } = usePosePlayback({
    projectRef,
    rigRef,
    animations: project.animations,
    update,
    preview,
  });
  const editing = usePoseEditing({
    projectRef,
    rigRef,
    partIdsRef,
    viewportRef,
    playbackRef,
    setPlayback,
    update,
    onPoseEdit,
  });
  const { activeJointId, selectJoint, poseJoint } = useActiveJoint({ rig, pose, selectedIds, transformMode });
  const { groupKey, robot } = useSelectedRobot(rig, pose, selectedIds);
  const groupKeyRef = useLatestRef(groupKey);
  const { setPose } = editing;
  const setRobotPose = useCallback(
    (local: RobotPoseState) => {
      const key = groupKeyRef.current;

      if (key) setPose(withRobotPose(rigRef.current, projectRef.current.pose, key, local));
    },
    [groupKeyRef, rigRef, projectRef, setPose],
  );
  const poseLibrary = usePoseLibrary({ projectRef, rigRef, groupKeyRef, update, setPose });
  const animationLibrary = useAnimationLibrary({ projectRef, rigRef, playbackRef, setPlayback, update });
  const pointOf = usePointOf(rigRef, viewportRef);

  return {
    rig,
    hasRig,
    pose,
    robot,
    setRobotPose,
    poses: groupKey ? (project.poses ?? []).filter((p) => robotKeyFor(rig, p) === groupKey) : [],
    animations: groupKey ? (project.animations ?? []).filter((a) => robotKeyFor(rig, a) === groupKey) : [],
    deltas,
    poseJoint,
    activeJointId,
    selectJoint,
    ...editing,
    ...poseLibrary,
    ...animationLibrary,
    playback,
    play,
    pause,
    scrub,
    pointOf,
  };
}

export function detectFeet(rig: Rig, pointOf: PointOf): { feet: string[]; phases: number[] } | null {
  const legLike = (name: string) => /hip|knee|ankle|leg|thigh|shin|foot|calf|toe|haa|hfe|kfe|ffe|faa/i.test(name);
  const legs = rig.joints.filter((j) => isMovable(j) && (j.limb === 'leg' || legLike(j.name) || legLike(j.id)));
  const leaves = legs.filter((j) => !legs.some((k) => k !== j && rig.chain.get(k.id)?.has(j.id)));
  const feet = leaves
    .map((j) => ({ id: j.id, p: pointOf(j.id, 'bottom') }))
    .filter((f): f is { id: string; p: V3 } => !!f.p && linkParts(rig, f.id).length > 0);

  if (feet.length < 2) return null;

  const z = feet.map((f) => f.p[2]);
  const frontBack = Math.max(...z) - Math.min(...z) > 60;

  feet.sort((a, b) => (frontBack && Math.abs(a.p[2] - b.p[2]) > 30 ? b.p[2] - a.p[2] : b.p[0] - a.p[0]));

  return { feet: feet.map((f) => f.id), phases: defaultPhases(feet.length) };
}
