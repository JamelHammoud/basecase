import { afterEach, expect, it, vi } from 'vitest';
import { currentConfirm, setConfirmRequest } from '../design-system/confirmStore';
import { assignmentOf, submissionOf } from './envelope';
import { classroomFixture } from './fixtures';
import { confirmRemoval } from './removal';
import type { Classroom } from './storage';

afterEach(() => setConfirmRequest(null));

it('confirms deletion of the selected revision even when grading replaces its tile', async () => {
  const { bundle } = classroomFixture();
  const assignment = await assignmentOf(bundle, 60);
  const tile = { submission: await submissionOf(assignment, bundle, 'Student') };
  const other = { submission: await submissionOf(assignment, bundle, 'Other student') };
  const state: { current: Classroom } = { current: { assignment, submissions: [tile, other] } };
  const cancel = vi.fn();
  const commit = vi.fn();

  confirmRemoval(tile, { cancel, commit, state });
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  state.current = { ...state.current, submissions: [{ ...tile, error: 'Stopped' }, other] };
  currentConfirm()!.onConfirm();
  expect(cancel).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledExactlyOnceWith({ assignment, submissions: [other] });
});
