import type { SkillRow } from '../../skills/skillRows';
import type { SnapshotRef } from '../../skills/snapshots';
import type { StressFinding } from '../../skills/stress';

export interface StressActions {
  onStress: (row: SkillRow) => void;
  onFinding: (row: SkillRow, finding: StressFinding) => void;
  onTrainOnFindings: (row: SkillRow) => void;
  canTrainOnFindings: (row: SkillRow) => boolean;
}

export interface SkillActions {
  onTrain: (row: SkillRow) => void;
  onTry: (row: SkillRow) => void;
  onDrive: () => void;
  onStop: () => void;
  onSnapshot?: (row: SkillRow, ref: SnapshotRef) => void;
  stress?: StressActions;
}
