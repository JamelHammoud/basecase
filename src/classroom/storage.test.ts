import { expect, it } from 'vitest';
import { addSubmission } from './storage';
import { classroomFixture } from './fixtures';
import { assignmentOf, CLASSROOM_MAX_BYTES, classroomBytes, submissionOf } from './envelope';

it('bounds retained submissions by content, count and input bytes without serializing the class again', async () => {
  const { bundle } = classroomFixture();
  const assignment = await assignmentOf(bundle, 60);
  const first = await submissionOf(assignment, bundle, 'Student');
  const initial = addSubmission({ assignment, submissions: [] }, first, classroomBytes(first).length);

  expect(addSubmission(initial, first, classroomBytes(first).length)).toBe(initial);
  expect(() => addSubmission({ assignment, submissions: [] }, first, CLASSROOM_MAX_BYTES + 1)).toThrow('too large');

  const full = {
    assignment,
    submissions: Array.from({ length: 30 }, (_, index) => ({
      submission: { ...first, fingerprint: String(index) },
      inputBytes: 1,
    })),
  };

  expect(() => addSubmission(full, first, 1)).toThrow('30');

  const large = {
    ...full,
    submissions: full.submissions.slice(0, 8).map((tile) => ({ ...tile, inputBytes: CLASSROOM_MAX_BYTES })),
  };

  expect(() => addSubmission(large, first, 1)).toThrow('64 MB');
});
