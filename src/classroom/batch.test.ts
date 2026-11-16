import { describe, expect, it, vi } from 'vitest';
import { gradeClassroom } from './batch';
import { assignmentOf, classroomBytes, submissionOf } from './envelope';
import { classroomFiles } from './files';
import { classroomFixture } from './fixtures';
import { ClassroomGrader } from './grading';
import { addSubmission, type Classroom, type SubmissionTile } from './storage';
import type { StudyRow } from '../study/types';

describe('classroom batch grading', () => {
  it('keeps malformed revisions from stopping a batch and retains distinct revisions with the same name', async () => {
    const { bundle } = classroomFixture();
    const assignment = await assignmentOf(bundle, 60);
    const valid = await submissionOf(assignment, bundle, 'Student');
    const changed = structuredClone(bundle);

    changed.robot.parts[0].dimensions.width += 10;

    const revised = await submissionOf(assignment, changed, 'Student');
    const bad = { ...valid, fingerprint: 'forged', assignmentFingerprint: 'changed' };
    const grader = new ClassroomGrader();
    const grade = vi.spyOn(grader, 'grade').mockImplementation(async (teacher, submission): Promise<StudyRow> => {
      await classroomFiles.pin({ assignment: teacher, submission });

      return {
        key: submission.fingerprint,
        sceneKey: submission.fingerprint,
        label: submission.name,
        selection: [],
        checks: [],
        costUsd: 10,
        massG: 100,
        metrics: { massG: 100, torque: 'pass' },
      };
    });
    const collected: SubmissionTile[] = [];
    const running: string[] = [];
    const classroom = [bad, valid, revised, valid].reduce<Classroom>(
      (current, submission) => addSubmission(current, submission, classroomBytes(submission).length),
      { assignment, submissions: [] },
    );

    expect(classroom.submissions).toHaveLength(3);
    await gradeClassroom({
      snapshot: classroom,
      grader,
      current: () => true,
      onRunning: (key) => running.push(key),
      onTile: (tile) => collected.push(tile),
    });
    expect(grade.mock.calls).toEqual([
      [assignment, bad],
      [assignment, valid],
      [assignment, revised],
    ]);
    expect(running).toEqual([bad.fingerprint, valid.fingerprint, revised.fingerprint]);
    expect(collected).toHaveLength(3);
    expect(collected[0].error).toMatch(/fingerprint|revision/);
    expect(collected[0].result).toBeUndefined();
    expect(collected.slice(1).every((tile) => !!tile.result)).toBe(true);
    expect(collected.slice(1).map((tile) => tile.result?.key)).toEqual([valid.fingerprint, revised.fingerprint]);
    expect(collected.slice(1).map((tile) => tile.result?.label)).toEqual(['Student', 'Student']);
    expect(collected.slice(1).every((tile) => tile.error === undefined)).toBe(true);
  });
});
