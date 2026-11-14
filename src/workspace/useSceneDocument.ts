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
import type { CaseConsole } from '../cases/console/format';
import {
  EMPTY_DOC,
  consolesOf,
  docFromParts,
  liveEdit,
  pushHistory,
  trackedOf,
  travelProject,
  withCaseConsoles,
  type HistoryStep,
} from './docHistory';
import { useBooleanResults } from './useBooleanResults';
import { projectFromSeed } from './helpers';
import type { CommitParts, DocState, Snapshot, WorkspaceSeed } from './types';

const POSE_FOLD_MS = 700;

type ProjectPatch = (p: ProjectSettings) => ProjectSettings;

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
  const tracked = () => trackedOf(projectRef.current);

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

  const recordSkeletonEdit = (before: RobotSkeleton | undefined) => {
    writeDoc(pushHistory(docRef.current, docRef.current.parts, { ...tracked(), skeleton: before }));
    lastPoseEditRef.current = 0;
  };

  const commitProject = (before: Partial<Snapshot>, patch: ProjectPatch, parts = docRef.current.parts) => {
    settleLiveJoints();
    writeDoc(pushHistory(docRef.current, parts, { ...tracked(), ...before }));
    updateProjectNow(patch);
    lastPoseEditRef.current = 0;
  };

  const commitMarks = (next: SceneMark[]) =>
    commitProject({}, (p) => ({ ...p, marks: next.length ? next : undefined }));

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

  const commitDesign = (parts: ScenePart[], tether: Tether | undefined) =>
    commitProject({ tether: projectRef.current.tether }, (p) => ({ ...p, tether }), parts);

  const commitConsole = (caseId: string, console: CaseConsole | undefined) =>
    commitProject({ consoles: consolesOf(projectRef.current.cases, [caseId]) }, (p) => ({
      ...p,
      cases: withCaseConsoles(p.cases, { [caseId]: console }),
    }));

  const travel = (step: HistoryStep, restorePose: (pose: RobotPoseState | undefined) => void) => {
    settleLiveJoints();

    const moved = travelProject(docRef.current, projectRef.current, step);

    if (!moved) return;

    writeDoc(moved.doc);
    lastPoseEditRef.current = 0;
    setProjectNow(moved.project);

    if (moved.to.pose !== moved.here.pose) restorePose(moved.to.pose);
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
    commitSkeleton: (parts: ScenePart[], skeleton: RobotSkeleton | undefined) =>
      commitProject({ skeleton: projectRef.current.skeleton }, (p) => ({ ...p, skeleton }), parts),
    commitConsole,
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
