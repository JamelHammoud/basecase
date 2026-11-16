import { idbGet, idbWrite } from '../utils/platform/web/idb';
import type { Assignment } from './envelope';
import type { Classroom, SubmissionTile } from './storage';

interface ClassroomIndex {
  assignment: string;
  submissions: string[];
}

let saved: Classroom | null = null;
const KEY = 'classroom';
const assignmentKey = (fingerprint: string) => `${KEY}:assignment:${fingerprint}`;
const tileKey = (fingerprint: string) => `${KEY}:submission:${fingerprint}`;

export async function loadClassroom(): Promise<Classroom | undefined> {
  const index = await idbGet<ClassroomIndex>('settings', KEY);

  if (!index) return undefined;

  const assignment = await idbGet<Assignment>('settings', assignmentKey(index.assignment));
  const tiles = await Promise.all(
    index.submissions.map((fingerprint) => idbGet<SubmissionTile>('settings', tileKey(fingerprint))),
  );

  if (!assignment || tiles.some((tile) => !tile)) throw new Error('Classroom files are missing.');

  const value = { assignment, submissions: tiles.filter((tile) => tile !== undefined) };

  saved = value;

  return value;
}

export async function saveClassroom(value: Classroom) {
  const index: ClassroomIndex = {
    assignment: value.assignment.fingerprint,
    submissions: value.submissions.map((tile) => tile.submission.fingerprint),
  };
  const changed = value.submissions.filter((tile) => !saved?.submissions.includes(tile));
  const removed = (saved?.submissions ?? []).filter((tile) => !index.submissions.includes(tile.submission.fingerprint));
  const previousAssignment = saved?.assignment;
  const changes: Parameters<typeof idbWrite>[0] = [
    { kind: 'put', store: 'settings', key: KEY, value: index },
    ...changed.map((tile) => ({
      kind: 'put' as const,
      store: 'settings' as const,
      key: tileKey(tile.submission.fingerprint),
      value: tile,
    })),
    ...removed.map((tile) => ({
      kind: 'delete' as const,
      store: 'settings' as const,
      key: tileKey(tile.submission.fingerprint),
    })),
  ];

  if (previousAssignment !== value.assignment)
    changes.push({ kind: 'put', store: 'settings', key: assignmentKey(index.assignment), value: value.assignment });

  if (previousAssignment && previousAssignment.fingerprint !== index.assignment)
    changes.push({ kind: 'delete', store: 'settings', key: assignmentKey(previousAssignment.fingerprint) });

  await idbWrite(changes);

  saved = value;
}
