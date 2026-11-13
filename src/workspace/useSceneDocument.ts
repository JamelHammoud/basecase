import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PROJECT,
  type ProjectSettings,
  type RobotJoint,
  type RobotPoseState,
  type SceneMark,
  type ScenePart,
  type Tether,
} from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { editWithOperands } from '../booleans/operands';
import { jointsWithoutParts } from '../utils/kinematics';
import { EMPTY_DOC, docFromParts, liveEdit, pushHistory, stepHistory, type HistoryDirection } from './docHistory';
import { useBooleanResults } from './useBooleanResults';
import { projectFromSeed } from './helpers';
import type { CommitParts, DocState, Snapshot, WorkspaceSeed } from './types';
import { readOnHand, writeOnHand } from '../components/build/usePurchases';

const POSE_FOLD_MS = 700;

function supplyFor(d: DocState, direction: HistoryDirection, tether: Tether | undefined) {
  const next = (direction === 'undo' ? d.past : d.future).at(-1);

  return next && 'tether' in next ? { tether } : {};
}

function onHandFor(d: DocState, direction: HistoryDirection) {
  const next = (direction === 'undo' ? d.past : d.future).at(-1)?.onHand;

  return next ? { onHand: { key: next.key, count: readOnHand(next.key) } } : {};
}

interface TravelFrom {
  d: DocState;
  tracked: Omit<Snapshot, 'parts'>;
  tether: Tether | undefined;
}

function travelStep(direction: HistoryDirection, { d, tracked, tether }: TravelFrom) {
  const here: Snapshot = { parts: d.parts, ...tracked, ...supplyFor(d, direction, tether), ...onHandFor(d, direction) };
  const moved = stepHistory(d, here, direction);

  return moved && { ...moved, here };
}

function restoreOutside(
  { to, here }: { to: Snapshot; here: Snapshot },
  restorePose: (pose: RobotPoseState | undefined) => void,
) {
  if (to.pose !== here.pose) restorePose(to.pose);

  if (to.onHand) void writeOnHand(to.onHand.key, to.onHand.count);
}

function restoredProject(to: Snapshot, here: Snapshot): Partial<ProjectSettings> {
  return {
    ...(to.joints === here.joints ? {} : { joints: to.joints }),
    ...(to.marks === here.marks ? {} : { marks: to.marks }),
    ...(to.skeleton === here.skeleton ? {} : { skeleton: to.skeleton }),
    ...('tether' in to && to.tether !== here.tether ? { tether: to.tether } : {}),
  };
}

function useProjectState(seed?: WorkspaceSeed) {
  const [project, setProject] = useState<ProjectSettings>(() => projectFromSeed(seed?.project));
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const setProjectNow = (next: ProjectSettings) => {
    projectRef.current = next;
    setProject(next);
  };

  const updateProjectNow = (patch: (p: ProjectSettings) => ProjectSettings) => setProjectNow(patch(projectRef.current));

  return { project, setProject, projectRef, setProjectNow, updateProjectNow };
}

export function useSceneDocument(seed?: WorkspaceSeed) {
  const projectState = useProjectState(seed);
  const { projectRef, updateProjectNow, setProjectNow } = projectState;
  const [doc, setDoc] = useState<DocState>(() => (seed ? { ...EMPTY_DOC, parts: seed.parts } : EMPTY_DOC));
  const docRef = useRef(doc);
  const partsRef = useRef(doc.parts);
  const lastPoseEditRef = useRef(0);
  const liveJointsRef = useRef<{ key: string; joints: RobotJoint[] | undefined } | null>(null);

  useEffect(() => {
    partsRef.current = doc.parts;
  }, [doc.parts]);

  const writeDoc = (next: DocState) => {
    docRef.current = next;
    partsRef.current = next.parts;
    setDoc(next);
  };

  useBooleanResults(doc.parts, docRef, writeDoc);

  const restoreJoints = (joints: RobotJoint[] | undefined) => updateProjectNow((p) => ({ ...p, joints }));
  const tracked = (): Omit<Snapshot, 'parts'> => {
    const { pose, joints, marks, skeleton } = projectRef.current;

    return { pose, joints, marks, skeleton };
  };

  const settleLiveJoints = (key?: string) => {
    const pending = liveJointsRef.current;

    if (!pending || pending.key === key) return pending;

    liveJointsRef.current = null;
    writeDoc(pushHistory(docRef.current, docRef.current.parts, { ...tracked(), joints: pending.joints }));

    return null;
  };

  const commitParts: CommitParts = (updater, live = false) => {
    if (!live) settleLiveJoints();

    const now = tracked();
    const { joints } = now;
    const d = docRef.current;

    if (live) {
      writeDoc(liveEdit(d, editWithOperands(d.parts, updater)));

      return;
    }

    const parts = editWithOperands(d.parts, updater);
    const kept = new Set(parts.map((p) => p.id));
    const nextJoints = jointsWithoutParts(joints, new Set(d.parts.filter((p) => !kept.has(p.id)).map((p) => p.id)));

    writeDoc(pushHistory(d, parts, now));

    if (nextJoints !== joints) restoreJoints(nextJoints);

    lastPoseEditRef.current = 0;
  };

  const recordPoseEdit = (before: RobotPoseState | undefined) => {
    settleLiveJoints();

    const now = performance.now();
    const folds = now - lastPoseEditRef.current < POSE_FOLD_MS;

    lastPoseEditRef.current = now;

    if (folds) return;

    const d = docRef.current;

    writeDoc(pushHistory(d, d.parts, { ...tracked(), pose: before }));
  };

  const recordEdit = (before: Partial<Omit<Snapshot, 'parts'>>, next = docRef.current.parts) => {
    settleLiveJoints();
    writeDoc(pushHistory(docRef.current, next, { ...tracked(), ...before }));
    lastPoseEditRef.current = 0;
  };

  const commitMarks = (next: SceneMark[]) => {
    recordEdit({});
    updateProjectNow((p) => ({ ...p, marks: next.length ? next : undefined }));
  };

  const commitJoints = (update: (p: ProjectSettings) => ProjectSettings, edit?: { key: string; live: boolean }) => {
    const pending = settleLiveJoints(edit?.key);
    const now = tracked();
    const before = pending ?? { key: edit?.key ?? '', joints: now.joints };

    updateProjectNow(update);

    if (edit?.live) {
      liveJointsRef.current = before;

      return;
    }

    liveJointsRef.current = null;
    writeDoc(pushHistory(docRef.current, docRef.current.parts, { ...now, joints: before.joints }));
    lastPoseEditRef.current = 0;
  };

  const commitDesign = (parts: ScenePart[], tether: Tether | undefined) => {
    recordEdit({ tether: projectRef.current.tether }, parts);
    updateProjectNow((p) => ({ ...p, tether }));
  };

  const setOnHand = (key: string, count: number) => {
    recordEdit({ onHand: { key, count: readOnHand(key) } });

    return writeOnHand(key, count);
  };

  const travel = (direction: HistoryDirection, restorePose: (pose: RobotPoseState | undefined) => void) => {
    settleLiveJoints();

    const moved = travelStep(direction, { d: docRef.current, tracked: tracked(), tether: projectRef.current.tether });

    if (!moved) return;

    writeDoc(moved.doc);
    lastPoseEditRef.current = 0;
    updateProjectNow((p) => ({ ...p, ...restoredProject(moved.to, moved.here) }));
    restoreOutside(moved, restorePose);
  };

  const clearDocument = () => {
    partsRef.current = [];
    writeDoc(EMPTY_DOC);
    setProjectNow({ ...DEFAULT_PROJECT });
  };

  return {
    ...projectState,
    doc,
    parts: doc.parts,
    docRef,
    partsRef,
    writeDoc,
    commitParts,
    commitMarks,
    commitJoints,
    commitDesign,
    setOnHand,
    recordPoseEdit,
    recordSkeletonEdit: (before: RobotSkeleton | undefined) => recordEdit({ skeleton: before }),
    resetDoc: (parts: ScenePart[]) => writeDoc(docFromParts(parts)),
    travel,
    clearDocument,
    canUndo: doc.past.length > 0 || doc.base !== null,
    canRedo: doc.future.length > 0,
  };
}

export type SceneDocument = ReturnType<typeof useSceneDocument>;
