import { confirmAction } from '../design-system';
import type { Classroom, SubmissionTile } from './storage';

export function confirmRemoval(
  tile: SubmissionTile,
  control: {
    cancel: () => void;
    state: { current: Classroom | null };
    commit: (next: Classroom) => void;
  },
) {
  confirmAction({
    title: `Delete ${tile.submission.name}?`,
    onConfirm: () => {
      control.cancel();

      if (control.state.current)
        control.commit({
          ...control.state.current,
          submissions: control.state.current.submissions.filter(
            (item) => item.submission.fingerprint !== tile.submission.fingerprint,
          ),
        });
    },
  });
}
