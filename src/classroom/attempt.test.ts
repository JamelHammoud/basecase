import { expect, it, vi } from 'vitest';
import { assignmentOf } from './envelope';
import { classroomFixture } from './fixtures';
import { openAttempt } from './storage';
import { saveScene } from '../utils/platform/web/webScenes';

vi.mock('../utils/platform/web/webScenes', () => ({ saveScene: vi.fn() }));

it('imports the same assignment into independent editable attempts', async () => {
  const { bundle } = classroomFixture();
  const assignment = await assignmentOf(bundle, 60);
  const original = structuredClone(assignment);
  const firstId = await openAttempt(assignment, 'Student');
  const first = vi.mocked(saveScene).mock.calls[0][0];

  first.parts![0].dimensions.width += 10;

  const secondId = await openAttempt(assignment, 'Student');
  const second = vi.mocked(saveScene).mock.calls[1][0];

  expect(firstId).not.toBe(secondId);
  expect(first.id).toBe(firstId);
  expect(second.id).toBe(secondId);
  expect(second.parts).toEqual(bundle.robot.parts);
  expect(second.project?.assignment).toEqual({ assignment: original, name: 'Student', inspection: undefined });
  expect(second.project?.budgetUsd).toBe(60);
  expect(first.parts).not.toEqual(second.parts);
  expect(assignment).toEqual(original);
});
