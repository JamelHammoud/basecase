import { errorMessage } from '../utils/errorMessage';
import type { Classroom, SubmissionTile } from './storage';
import type { ClassroomGrader } from './grading';

export async function gradeClassroom(input: {
  snapshot: Classroom;
  grader: ClassroomGrader;
  current: () => boolean;
  onRunning: (key: string) => void;
  onTile: (tile: SubmissionTile) => void;
}) {
  for (const tile of input.snapshot.submissions) {
    if (!input.current()) break;

    input.onRunning(tile.submission.fingerprint);

    try {
      const result = await input.grader.grade(input.snapshot.assignment, tile.submission);

      if (input.current()) input.onTile({ ...tile, result, error: undefined });
    } catch (error) {
      if (input.current()) input.onTile({ ...tile, result: undefined, error: errorMessage(error) });
    }
  }
}
