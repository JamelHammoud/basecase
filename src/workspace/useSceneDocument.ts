import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PROJECT,
  type ProjectSettings,
  type RobotJoint,
  type RobotPoseState,
  type ScenePart,
} from '../types/robotics';
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
    setDoc(next);
  };

  const restoreJoints = (joints: RobotJoint[] | undefined) => updateProjectNow((p) => ({ ...p, joints }));

  const commitParts: CommitParts = (updater, live = false) => {
    const { pose, joints } = projectRef.current;
    const d = docRef.current;

    if (live) {
      writeDoc(liveEdit(d, updater(d.parts)));

      return;
    }

    const parts = updater(d.parts);
    const kept = new Set(parts.map((p) => p.id));
    const nextJoints = jointsWithoutParts(joints, new Set(d.parts.filter((p) => !kept.has(p.id)).map((p) => p.id)));

    writeDoc(pushHistory(d, parts, { pose, joints }));

    if (nextJoints !== joints) restoreJoints(nextJoints);

    lastPoseEditRef.current = 0;
  };

  const recordPoseEdit = (before: RobotPoseState | undefined) => {
    const now = performance.now();
    const folds = now - lastPoseEditRef.current < POSE_FOLD_MS;

    lastPoseEditRef.current = now;

    if (folds) return;

    const d = docRef.current;

    writeDoc(pushHistory(d, d.parts, { pose: before, joints: projectRef.current.joints }));
  };

  const travel = (direction: HistoryDirection, restorePose: (pose: RobotPoseState | undefined) => void) => {
    const d = docRef.current;
    const here: Snapshot = { parts: d.parts, pose: projectRef.current.pose, joints: projectRef.current.joints };
    const moved = stepHistory(d, here, direction);

    if (!moved) return;

    writeDoc(moved.doc);
    lastPoseEditRef.current = 0;

    if (moved.to.joints !== here.joints) restoreJoints(moved.to.joints);

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
    recordPoseEdit,
    resetDoc: (parts: ScenePart[]) => writeDoc(docFromParts(parts)),
    travel,
    clearDocument,
    canUndo: doc.past.length > 0 || doc.base !== null,
    canRedo: doc.future.length > 0,
  };
}

export type SceneDocument = ReturnType<typeof useSceneDocument>;
