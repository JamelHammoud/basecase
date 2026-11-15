import type { FrameSet } from '../../vision/frameSet';
import { commitLabels, createLabelHistory, redoLabels, undoLabels } from '../../vision/labelEdits';

export type LabelEdit = (set: FrameSet) => FrameSet;

export function createLabelDocumentHistory(set: FrameSet) {
  let history = createLabelHistory(set);

  return {
    current: () => history.present,
    edit: (operation: LabelEdit) => {
      history = commitLabels(history, operation(history.present));

      return history;
    },
    undo: () => {
      history = undoLabels(history);

      return history;
    },
    redo: () => {
      history = redoLabels(history);

      return history;
    },
  };
}
