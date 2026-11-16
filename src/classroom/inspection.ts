import type { Assignment } from './envelope';
import { openAttempt, type SubmissionTile } from './storage';

export function inspectSubmission(assignment: Assignment, tile: SubmissionTile, onError: (error: unknown) => void) {
  const tab = window.open('about:blank', '_blank');

  if (!tab) return;

  const failing = tile.result?.checks.find((check) => check.status === 'fail');

  tab.opener = null;
  void openAttempt(
    assignment,
    tile.submission.name,
    tile.submission,
    failing && { check: failing.check, ids: failing.ids ?? [] },
  )
    .then((id) => {
      tab.location.href = `/classroom?attempt=${encodeURIComponent(id)}`;
    })
    .catch((failure) => {
      tab.close();
      onError(failure);
    });
}
