import { classroomFileClient } from './fileClient';
import { readStored, writeStored } from '../app/storedSettings';
import { saveScene } from '../utils/platform/web/webScenes';
import { bundleScene } from '../gallery/galleryBundle';
import type { StudyRow } from '../study/types';
import {
  CLASSROOM_MAX_BYTES,
  CLASSROOM_MAX_SUBMISSIONS,
  CLASSROOM_TOTAL_BYTES,
  type Assignment,
  type Submission,
} from './envelope';

export interface SubmissionTile {
  submission: Submission;
  inputBytes?: number;
  result?: StudyRow;
  error?: string;
}

export interface Classroom {
  assignment: Assignment;
  submissions: SubmissionTile[];
}

export { loadClassroom, saveClassroom } from './classroomStore';

export function addSubmission(classroom: Classroom, submission: Submission, inputBytes: number): Classroom {
  if (classroom.submissions.some((tile) => tile.submission.fingerprint === submission.fingerprint)) return classroom;

  if (classroom.submissions.length >= CLASSROOM_MAX_SUBMISSIONS) throw new Error('A class holds up to 30 submissions.');

  if (!Number.isSafeInteger(inputBytes) || inputBytes < 1 || inputBytes > CLASSROOM_MAX_BYTES)
    throw new Error('Classroom file is too large.');

  const bytes = classroom.submissions.reduce((n, tile) => n + (tile.inputBytes ?? 0), inputBytes);

  if (bytes > CLASSROOM_TOTAL_BYTES) throw new Error('Classroom files exceed 64 MB.');

  return { ...classroom, submissions: [...classroom.submissions, { submission, inputBytes }] };
}

export async function openAttempt(
  assignment: Assignment,
  name: string,
  submission?: Submission,
  inspection?: { check: string; ids: string[] },
): Promise<string> {
  const client = classroomFileClient();
  const checked = await client.call('attempt', { assignment, submission }).finally(client.dispose);
  const bundle = checked.bundle;
  const scene = bundleScene(bundle);
  const id = `attempt-${crypto.randomUUID()}`;

  await saveScene({
    ...scene,
    id,
    name: name || bundle.title,
    project: {
      ...scene.project,
      ...checked.design,
      budgetUsd: assignment.budgetUsd,
      assignment: { assignment: checked.assignment, name, inspection },
    },
  });

  return id;
}

export function showAttempt(id: string) {
  const open = (readStored('open-scenes') as { ids?: string[] } | null) ?? {};

  writeStored('open-scenes', {
    ids: [id, ...(open.ids ?? []).filter((item) => item !== id)].slice(0, 8),
    tabIds: [],
    active: 0,
  });
  location.assign('/');
}
