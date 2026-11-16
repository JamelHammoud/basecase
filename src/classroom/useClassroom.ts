import { gradeClassroom } from './batch';
import { useEffect, useRef, useState } from 'react';
import { confirmAction } from '../design-system';
import { errorMessage } from '../utils/errorMessage';
import { classroomFileClient } from './fileClient';
import { ClassroomGrader } from './grading';
import {
  addSubmission,
  loadClassroom,
  openAttempt,
  saveClassroom,
  showAttempt,
  type Classroom,
  type SubmissionTile,
} from './storage';
import { CLASSROOM_MAX_SUBMISSIONS } from './envelope';
import { confirmRemoval } from './removal';

function releaseClassroom(client: ReturnType<typeof classroomFileClient> | null, grader: ClassroomGrader | null) {
  client?.dispose();
  grader?.cancel();
}

export function useClassroom() {
  const [value, setValue] = useState<Classroom | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const state = useRef<Classroom | null>(null);
  const active = useRef<ClassroomGrader | null>(null);
  const writes = useRef(Promise.resolve());
  const client = useRef<ReturnType<typeof classroomFileClient> | null>(null);
  const report = (error: unknown) => setErrors((list) => [...list.slice(-29), errorMessage(error)]);
  const commit = (next: Classroom) => {
    state.current = next;
    setValue(next);
    writes.current = writes.current.catch(report).then(() => saveClassroom(next));
    void writes.current.catch(report);
  };

  useEffect(() => {
    let live = true;

    client.current = classroomFileClient();
    void loadClassroom()
      .catch(report)
      .then((saved) => {
        if (!live) return;

        state.current = saved ?? null;
        setValue(saved ?? null);
        setLoaded(true);
      });

    return () => {
      live = false;
      releaseClassroom(client.current, active.current);
    };
  }, []);

  const cancel = () => {
    active.current?.cancel();
    active.current = null;
    setRunning(null);
  };
  const importAssignment = async (file: File) => {
    if (!client.current) return;

    setBusy(true);

    try {
      const assignment = await client.current.call('assignment', file);
      const replace = () => {
        cancel();
        commit({ assignment, submissions: [] });
      };

      if (state.current && state.current.assignment.fingerprint !== assignment.fingerprint)
        confirmAction({ title: `Delete ${state.current.assignment.bundle.title}?`, onConfirm: replace });

      if (!state.current) replace();
    } catch (error) {
      report(error);
    } finally {
      client.current?.dispose();
      client.current = classroomFileClient();
      setBusy(false);
    }
  };
  const importSubmissions = async (files: File[]) => {
    if (!client.current || !state.current) return;

    if (files.length > CLASSROOM_MAX_SUBMISSIONS) throw new Error('A class holds up to 30 submissions.');

    setBusy(true);

    for (const file of files) {
      try {
        const submission = await client.current.call('submission', file);
        const current = state.current;

        if (
          submission.assignmentId !== current.assignment.id ||
          submission.assignmentFingerprint !== current.assignment.fingerprint
        )
          throw new Error(`${file.name}: Assignment revision doesn’t match.`);

        commit(addSubmission(current, submission, file.size));
      } catch (error) {
        report(error);
      } finally {
        client.current?.dispose();
        client.current = classroomFileClient();
      }
    }

    setBusy(false);
  };
  const grade = async () => {
    const snapshot = state.current;

    if (!snapshot || active.current) return;

    const grader = new ClassroomGrader();

    active.current = grader;

    await gradeClassroom({
      snapshot,
      grader,
      current: () => active.current === grader,
      onRunning: setRunning,
      onTile: (tile) => {
        if (state.current)
          commit({
            ...state.current,
            submissions: state.current.submissions.map((item) =>
              item.submission.fingerprint === tile.submission.fingerprint ? tile : item,
            ),
          });
      },
    });

    if (active.current === grader) cancel();
  };

  return {
    value,
    loaded,
    busy,
    running,
    errors,
    report,
    importAssignment,
    importSubmissions,
    grade,
    cancel,
    remove: (tile: SubmissionTile) => confirmRemoval(tile, { cancel, state, commit }),
    start: async (name: string) => {
      if (state.current && name.trim()) showAttempt(await openAttempt(state.current.assignment, name.trim()));
    },
  };
}

export type ClassroomControl = ReturnType<typeof useClassroom>;
