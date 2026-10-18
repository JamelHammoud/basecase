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
  rig: Rig;
  /** The scene has joints to pose */
  hasRig: boolean;
  pose: RobotPoseState | undefined;
  poses: RobotPose[];
  animations: RobotAnimation[];
  deltas: Map<string, THREE.Matrix4>;
  poseJoint: { id: string; type: 'revolute' | 'prismatic'; origin: THREE.Vector3; axis: THREE.Vector3 } | null;
  activeJointId: string | null;
  selectJoint: (id: string | null) => void;
  setJointValue: (id: string, value: number) => void;
  setPose: (next: RobotPoseState | null) => void;
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
}: {
  parts: ScenePart[];
  project: ProjectSettings;
  projectRef: React.MutableRefObject<ProjectSettings>;
  setProject: (p: ProjectSettings) => void;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  transformMode: TransformMode;
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

  const setPose = useCallback(
    (next: RobotPoseState | null) => {
      if (playbackRef.current?.playing) setPlayback((p) => (p ? { ...p, playing: false } : p));
      update({ pose: next && !isRestPose(next) ? next : undefined });
      // The canvas may still show a playback frame the state already equals
      viewportRef.current?.setPose(poseDeltas(rigRef.current, next, partIdsRef.current));
    },
    [update, viewportRef]
  );

  const animationOf = (id: string) => projectRef.current.animations?.find((a) => a.id === id);

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
      const state = sampleAnimation(anim, t);
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
    setPlayback({ id, t, playing: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    const cur = playbackRef.current;
    if (!cur) return;
    const anim = animationOf(cur.id);
    setPlayback({ ...cur, playing: false });
    if (anim) {
      const state = sampleAnimation(anim, cur.t);
      update({ pose: isRestPose(state) ? undefined : state });
      preview(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, update]);

  const scrub = useCallback(
    (id: string, t: number) => {
      const anim = animationOf(id);
      if (!anim) return;
      setPlayback({ id, t, playing: false });
      const state = sampleAnimation(anim, t);
      update({ pose: isRestPose(state) ? undefined : state });
      preview(state);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, update]
  );

  /* Joints --------------------------------------------------------- */
  const [activeJointId, setActiveJointId] = useState<string | null>(null);
  // In the Pose tool, clicking a part picks the joint that turns it
  useEffect(() => {
    if (transformMode !== 'pose' || !selectedIds.length) return;
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
      setPose({ values: { ...cur?.values, [id]: clampJoint(j, value) }, root: cur?.root });
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

  /* Saved poses and animations -------------------------------------- */
  const savePose = useCallback(
    (name: string) => {
      const p: RobotPose = { id: newId('pose'), name, values: { ...projectRef.current.pose?.values }, root: projectRef.current.pose?.root };
      update({ poses: [...(projectRef.current.poses ?? []), p] });
      return p;
    },
    [projectRef, update]
  );
  const applySavedPose = useCallback(
    (id: string) => {
      const p = projectRef.current.poses?.find((x) => x.id === id);
      if (p) setPose({ values: { ...p.values }, root: p.root });
    },
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
      // Same name replaces (the agent revising its walk cycle)
      const existing = list.find((a) => a.name === anim.name);
      const made = { ...anim, id: anim.id || existing?.id || newId('anim') };
      update({ animations: existing ? list.map((a) => (a.id === existing.id ? made : a)) : [...list, made] });
      return made;
    },
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
    poses: project.poses ?? [],
    animations: project.animations ?? [],
    deltas,
    poseJoint,
    activeJointId,
    selectJoint,
    setJointValue,
    setPose,
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
