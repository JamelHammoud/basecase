import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { ProjectSettings, RobotAnimation, RobotPose, RobotPoseState, ScenePart, TransformMode } from '../types/robotics';
import type { Viewport3DHandle } from '../components/Viewport3D';
import {
  buildRig,
  clampJoint,
  forwardKinematics,
  isMovable,
  isRestPose,
  linkParts,
  poseDeltas,
  posedAxis,
  resolveJoints,
  robotOfParts,
  robotPose,
  robotRig,
  withRobotPose,
  type RobotGroup,
  type Rig,
  type V3,
} from './kinematics';
import { goalParts, sampleAnimation, type PointOf } from './animation';

export interface Playback {
  id: string;
  t: number;
  playing: boolean;
}

export interface Posing {
  /** Every robot in the scene (the canvas poses them all) */
  rig: Rig;
  /** The scene has joints to pose */
  hasRig: boolean;
  /** The pose on the canvas, every robot */
  pose: RobotPoseState | undefined;
  /** The robot the selection is on, alone: the Pose tab, walk cycles and mocap work on it */
  robot: { group: RobotGroup; rig: Rig; pose: RobotPoseState } | null;
  /** The selected robot's saved poses and animations */
  poses: RobotPose[];
  animations: RobotAnimation[];
  /** Replaces the selected robot's pose (joint values and body offset); other robots keep theirs */
  setRobotPose: (local: RobotPoseState) => void;
  deltas: Map<string, THREE.Matrix4>;
  poseJoint: { id: string; type: 'revolute' | 'prismatic'; origin: THREE.Vector3; axis: THREE.Vector3 } | null;
  activeJointId: string | null;
  selectJoint: (id: string | null) => void;
  setJointValue: (id: string, value: number) => void;
  setPose: (next: RobotPoseState | null) => void;
  /** Puts a pose back (undo / redo) without recording an undo step */
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
  /** Rest-pose point of a part or a joint's link: its bottom center or center */
  pointOf: PointOf;
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

/** Joints, the pose on the canvas, saved poses and animation playback for one scene */
export function usePosing({
  parts,
  project,
  projectRef,
  setProject,
  viewportRef,
  selectedIds,
  transformMode,
  onPoseEdit,
}: {
  parts: ScenePart[];
  project: ProjectSettings;
  projectRef: React.MutableRefObject<ProjectSettings>;
  setProject: (p: ProjectSettings) => void;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  transformMode: TransformMode;
  /** A pose edit is about to happen (record an undo step with the pose before it) */
  onPoseEdit?: (before: RobotPoseState | undefined) => void;
}): Posing {
  const joints = project.joints;
  const rig = useMemo(() => buildRig(resolveJoints(joints ?? [], parts), parts), [joints, parts]);
  const rigRef = useRef(rig);
  rigRef.current = rig;
  const hasRig = rig.joints.some(isMovable);
  const pose = project.pose;
  const partIds = useMemo(() => parts.map((p) => p.id), [parts]);
  const partIdsRef = useRef(partIds);
  partIdsRef.current = partIds;
  const deltas = useMemo(() => poseDeltas(rig, pose, partIds), [rig, pose, partIds]);

  const update = useCallback(
    (patch: Partial<ProjectSettings>) => {
      const next = { ...projectRef.current, ...patch };
      projectRef.current = next;
      setProject(next);
    },
    [projectRef, setProject]
  );

  /* Playback ------------------------------------------------------- */
  const [playback, setPlayback] = useState<Playback | null>(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const preview = useCallback((state: RobotPoseState) => {
    viewportRef.current?.setPose(poseDeltas(rigRef.current, state, partIdsRef.current));
  }, [viewportRef]);

  const onPoseEditRef = useRef(onPoseEdit);
  onPoseEditRef.current = onPoseEdit;
  const applyPoseState = useCallback(
    (next: RobotPoseState | null | undefined, record: boolean) => {
      if (playbackRef.current?.playing) setPlayback((p) => (p ? { ...p, playing: false } : p));
      if (record) onPoseEditRef.current?.(projectRef.current.pose);
      update({ pose: next && !isRestPose(next) ? next : undefined });
      // The canvas may still show a playback frame the state already equals
      viewportRef.current?.setPose(poseDeltas(rigRef.current, next, partIdsRef.current));
    },
    [projectRef, update, viewportRef]
  );
  const setPose = useCallback((next: RobotPoseState | null) => applyPoseState(next, true), [applyPoseState]);
  const restorePose = useCallback((next: RobotPoseState | undefined) => applyPoseState(next, false), [applyPoseState]);

  const animationOf = (id: string) => projectRef.current.animations?.find((a) => a.id === id);
  /** The robot an animation or saved pose moves: its own, or the robot of its joints */
  const robotFor = (item: { robot?: string; values?: Record<string, number>; keyframes?: RobotAnimation['keyframes'] }) => {
    const r = rigRef.current;
    if (item.robot && r.robots.some((x) => x.key === item.robot)) return item.robot;
    const ids = Object.keys(item.values ?? item.keyframes?.[0]?.values ?? {});
    return ids.map((id) => r.robotOf.get(id)).find(Boolean) ?? r.robots[0]?.key ?? '';
  };
  /** An animation frame as a scene pose: the base pose with that robot moved */
  const frameOf = (anim: RobotAnimation, t: number, base: RobotPoseState | undefined) =>
    withRobotPose(rigRef.current, base, robotFor(anim), sampleAnimation(anim, t));
  // The scene pose when playback started: other robots hold it while one plays
  const playBase = useRef<RobotPoseState | undefined>(undefined);

  useEffect(() => {
    if (!playback?.playing) return;
    const anim = animationOf(playback.id);
    if (!anim) return;
    const start = performance.now() - playback.t * 1000;
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      let t = (now - start) / 1000;
      const done = !anim.loop && t >= anim.duration;
      if (done) t = anim.duration;
      const state = frameOf(anim, t, playBase.current);
      preview(state);
      if (done) {
        update({ pose: isRestPose(state) ? undefined : state });
        setPlayback({ id: anim.id, t, playing: false });
        return;
      }
      if (now - lastUi > 66) {
        lastUi = now;
        setPlayback((p) => (p && p.playing ? { ...p, t: anim.loop ? t % anim.duration : t } : p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Restart only when play starts or the animation changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.playing, playback?.id, project.animations, preview, update]);

  const play = useCallback((id: string, from?: number) => {
    const anim = animationOf(id);
    if (!anim) return;
    const cur = playbackRef.current;
    let t = from ?? (cur?.id === id ? cur.t : 0);
    if (!anim.loop && t >= anim.duration - 1e-3) t = 0;
    playBase.current = projectRef.current.pose;
    setPlayback({ id, t, playing: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    const cur = playbackRef.current;
    if (!cur) return;
    const anim = animationOf(cur.id);
    setPlayback({ ...cur, playing: false });
    if (anim) {
      const state = frameOf(anim, cur.t, playBase.current ?? projectRef.current.pose);
      update({ pose: isRestPose(state) ? undefined : state });
      preview(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, update]);

  const scrub = useCallback(
    (id: string, t: number) => {
      const anim = animationOf(id);
      if (!anim) return;
      if (!playbackRef.current?.playing && playbackRef.current?.id !== id) playBase.current = projectRef.current.pose;
      setPlayback({ id, t, playing: false });
      const state = frameOf(anim, t, playBase.current ?? projectRef.current.pose);
      update({ pose: isRestPose(state) ? undefined : state });
      preview(state);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, update]
  );

  /* Joints --------------------------------------------------------- */
  const [activeJointId, setActiveJointId] = useState<string | null>(null);
  // In the Pose tool, clicking a part picks the joint that turns it
  // (a whole robot selected picks none: the next click on one of its parts does)
  useEffect(() => {
    if (transformMode !== 'pose' || !selectedIds.length) return;
    if (selectedIds.length > 1) {
      const whole = robotOfParts(rig, selectedIds);
      if (whole && selectedIds.length >= whole.parts.size) setActiveJointId(null);
      return;
    }
    let at = rig.ownerOf.get(selectedIds[0]) ?? null;
    while (at && !isMovable(rig.byId.get(at)!)) at = rig.parentOf.get(at) ?? null;
    setActiveJointId(at);
  }, [selectedIds, transformMode, rig]);

  const posed = useMemo(() => forwardKinematics(rig, pose), [rig, pose]);
  const poseJoint = useMemo(() => {
    const j = activeJointId ? rig.byId.get(activeJointId) : undefined;
    if (!j || !isMovable(j)) return null;
    const a = posedAxis(rig, posed, j);
    return { id: j.id, type: j.type as 'revolute' | 'prismatic', origin: a.origin, axis: a.axis };
  }, [rig, posed, activeJointId]);

  const setJointValue = useCallback(
    (id: string, value: number) => {
      const j = rigRef.current.byId.get(id);
      if (!j) return;
      const cur = projectRef.current.pose;
      setPose({ ...cur, values: { ...cur?.values, [id]: clampJoint(j, value) } });
    },
    [projectRef, setPose]
  );

  const dragBase = useRef(0);
  const onPoseJoint = useCallback(
    (id: string, delta: number, phase: 'start' | 'move' | 'end') => {
      if (phase === 'start') dragBase.current = projectRef.current.pose?.values[id] ?? 0;
      setJointValue(id, Math.round((dragBase.current + delta) * 10) / 10);
    },
    [projectRef, setJointValue]
  );

  /* The selected robot -------------------------------------------- */
  const group = useMemo(() => robotOfParts(rig, selectedIds), [rig, selectedIds]);
  const groupKey = group?.key ?? null;
  const groupKeyRef = useRef(groupKey);
  groupKeyRef.current = groupKey;
  const oneRig = useMemo(() => (groupKey ? robotRig(rig, groupKey) : null), [rig, groupKey]);
  const robot = useMemo(
    () => (group && oneRig ? { group, rig: oneRig, pose: robotPose(rig, pose, group.key) } : null),
    [group, oneRig, rig, pose]
  );
  const setRobotPose = useCallback(
    (local: RobotPoseState) => {
      const key = groupKeyRef.current;
      if (key) setPose(withRobotPose(rigRef.current, projectRef.current.pose, key, local));
    },
    [projectRef, setPose]
  );

  /* Saved poses and animations -------------------------------------- */
  const savePose = useCallback(
    (name: string) => {
      const key = groupKeyRef.current ?? rigRef.current.robots[0]?.key;
      const local = key ? robotPose(rigRef.current, projectRef.current.pose, key) : { values: {} };
      const p: RobotPose = { id: newId('pose'), name, ...local, robot: key };
      update({ poses: [...(projectRef.current.poses ?? []), p] });
      return p;
    },
    [projectRef, update]
  );
  const applySavedPose = useCallback(
    (id: string) => {
      const p = projectRef.current.poses?.find((x) => x.id === id);
      if (!p) return;
      setPose(withRobotPose(rigRef.current, projectRef.current.pose, robotFor(p), { values: { ...p.values }, root: p.root }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRef, setPose]
  );
  const renamePose = useCallback(
    (id: string, name: string) => update({ poses: (projectRef.current.poses ?? []).map((p) => (p.id === id ? { ...p, name } : p)) }),
    [projectRef, update]
  );
  const deletePose = useCallback(
    (id: string) => update({ poses: (projectRef.current.poses ?? []).filter((p) => p.id !== id) }),
    [projectRef, update]
  );
  const addAnimation = useCallback(
    (anim: RobotAnimation) => {
      const list = projectRef.current.animations ?? [];
      const robotKey = anim.robot ?? robotFor(anim);
      // Same name on the same robot replaces (the agent revising its walk cycle)
      const existing = list.find((a) => a.name === anim.name && robotFor(a) === robotKey);
      const made = { ...anim, robot: robotKey, id: anim.id || existing?.id || newId('anim') };
      update({ animations: existing ? list.map((a) => (a.id === existing.id ? made : a)) : [...list, made] });
      return made;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRef, update]
  );
  const renameAnimation = useCallback(
    (id: string, name: string) => update({ animations: (projectRef.current.animations ?? []).map((a) => (a.id === id ? { ...a, name } : a)) }),
    [projectRef, update]
  );
  const deleteAnimation = useCallback(
    (id: string) => {
      if (playbackRef.current?.id === id) setPlayback(null);
      update({ animations: (projectRef.current.animations ?? []).filter((a) => a.id !== id) });
    },
    [projectRef, update]
  );
  const setAnimationLoop = useCallback(
    (id: string, loop: boolean) => update({ animations: (projectRef.current.animations ?? []).map((a) => (a.id === id ? { ...a, loop } : a)) }),
    [projectRef, update]
  );

  const pointOf: PointOf = useCallback(
    (id, where) => {
      const ids = goalParts(rigRef.current, id);
      const b = viewportRef.current?.restBounds(ids.length ? ids : [id]);
      if (!b) return null;
      const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      return where === 'bottom' ? [c[0], b.min[1], c[2]] : c;
    },
    [viewportRef]
  );

  const selectJoint = useCallback((id: string | null) => setActiveJointId(id), []);

  return {
    rig,
    hasRig,
    pose,
    robot,
    setRobotPose,
    poses: groupKey ? (project.poses ?? []).filter((p) => robotFor(p) === groupKey) : [],
    animations: groupKey ? (project.animations ?? []).filter((a) => robotFor(a) === groupKey) : [],
    deltas,
    poseJoint,
    activeJointId,
    selectJoint,
    setJointValue,
    setPose,
    restorePose,
    onPoseJoint,
    savePose,
    applySavedPose,
    renamePose,
    deletePose,
    addAnimation,
    renameAnimation,
    deleteAnimation,
    setAnimationLoop,
    playback,
    play,
    pause,
    scrub,
    pointOf,
  };
}

/** The feet of a legged robot: the last joint of each leg, front-left first, with gait phases */
export function detectFeet(rig: Rig, pointOf: PointOf): { feet: string[]; phases: number[] } | null {
  const legLike = (name: string) => /hip|knee|ankle|leg|thigh|shin|foot|calf|toe|haa|hfe|kfe|ffe|faa/i.test(name);
  const legs = rig.joints.filter((j) => isMovable(j) && (j.limb === 'leg' || legLike(j.name) || legLike(j.id)));
  // A foot joint: a leg joint with no leg joint below it
  const leaves = legs.filter((j) => !legs.some((k) => k !== j && rig.chain.get(k.id)?.has(j.id)));
  const feet = leaves
    .map((j) => ({ id: j.id, p: pointOf(j.id, 'bottom') }))
    .filter((f): f is { id: string; p: V3 } => !!f.p && linkParts(rig, f.id).length > 0);
  if (feet.length < 2) return null;
  // Front (+Z) before back, left (+X) before right
  const z = feet.map((f) => f.p[2]);
  const frontBack = Math.max(...z) - Math.min(...z) > 60;
  feet.sort((a, b) => (frontBack && Math.abs(a.p[2] - b.p[2]) > 30 ? b.p[2] - a.p[2] : b.p[0] - a.p[0]));
  const phases = feet.length === 2 ? [0, 0.5] : feet.length === 4 ? [0, 0.5, 0.5, 0] : feet.map((_, i) => i / feet.length);
  return { feet: feet.map((f) => f.id), phases };
}
