import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PROJECT,
  type ProjectSettings,
  type RobotJoint,
  type RobotPoseState,
  type SceneMark,
  type ScenePart,
} from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { jointsWithoutParts } from '../utils/kinematics';
import { EMPTY_DOC, docFromParts, liveEdit, pushHistory, stepHistory, type HistoryDirection } from './docHistory';
import { projectFromSeed } from './helpers';
import type { CommitParts, DocState, Snapshot, WorkspaceSeed } from './types';

const POSE_FOLD_MS = 700;

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

  useEffect(() => {
    partsRef.current = doc.parts;
  }, [doc.parts]);

  const writeDoc = (next: DocState) => {
    docRef.current = next;
    partsRef.current = next.parts;
    setDoc(next);
  };

  const restoreJoints = (joints: RobotJoint[] | undefined) => updateProjectNow((p) => ({ ...p, joints }));
  const tracked = (): Omit<Snapshot, 'parts'> => {
    const { pose, joints, marks, skeleton } = projectRef.current;

    return { pose, joints, marks, skeleton };
  };

  const commitParts: CommitParts = (updater, live = false) => {
    const now = tracked();
    const { joints } = now;
    const d = docRef.current;

    if (live) {
      writeDoc(liveEdit(d, updater(d.parts)));

      return;
    }

    const parts = updater(d.parts);
    const kept = new Set(parts.map((p) => p.id));
    const nextJoints = jointsWithoutParts(joints, new Set(d.parts.filter((p) => !kept.has(p.id)).map((p) => p.id)));

    writeDoc(pushHistory(d, parts, now));

    if (nextJoints !== joints) restoreJoints(nextJoints);

    lastPoseEditRef.current = 0;
  };

  const recordPoseEdit = (before: RobotPoseState | undefined) => {
    const now = performance.now();
    const folds = now - lastPoseEditRef.current < POSE_FOLD_MS;

    lastPoseEditRef.current = now;

    if (folds) return;

    const d = docRef.current;

    writeDoc(pushHistory(d, d.parts, { ...tracked(), pose: before }));
  };

  const recordSkeletonEdit = (before: RobotSkeleton | undefined) => {
    writeDoc(pushHistory(docRef.current, docRef.current.parts, { ...tracked(), skeleton: before }));
    lastPoseEditRef.current = 0;
  };

  const commitMarks = (next: SceneMark[]) => {
    const d = docRef.current;

    writeDoc(pushHistory(d, d.parts, tracked()));
    updateProjectNow((p) => ({ ...p, marks: next.length ? next : undefined }));
    lastPoseEditRef.current = 0;
  };

  const travel = (direction: HistoryDirection, restorePose: (pose: RobotPoseState | undefined) => void) => {
    const d = docRef.current;
    const here: Snapshot = { parts: d.parts, ...tracked() };
    const moved = stepHistory(d, here, direction);

    if (!moved) return;

    writeDoc(moved.doc);
    lastPoseEditRef.current = 0;

    if (moved.to.joints !== here.joints) restoreJoints(moved.to.joints);

    if (moved.to.marks !== here.marks) updateProjectNow((p) => ({ ...p, marks: moved.to.marks }));

    if (moved.to.skeleton !== here.skeleton) updateProjectNow((p) => ({ ...p, skeleton: moved.to.skeleton }));

    if (moved.to.pose !== here.pose) restorePose(moved.to.pose);
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
    recordPoseEdit,
    recordSkeletonEdit,
    resetDoc: (parts: ScenePart[]) => writeDoc(docFromParts(parts)),
    travel,
    clearDocument,
    canUndo: doc.past.length > 0 || doc.base !== null,
    canRedo: doc.future.length > 0,
  };
}

export type SceneDocument = ReturnType<typeof useSceneDocument>;
