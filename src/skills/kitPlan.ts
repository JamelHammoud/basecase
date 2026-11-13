import type { RobotAnimation } from '../types/robotics';
import type { ModelHashes } from './artifacts';
import type { TrainedEntry } from './kitEnvironment';
import type { SkillRecord } from './skillRecords';
import type { SkillRow, SkillTarget } from './skillRows';

export interface BackgroundTask {
  target: SkillTarget;
  label: string;
  entry: TrainedEntry | null;
  move: RobotAnimation | null;
  kind: 'recheck' | 'train';
  record: SkillRecord;
}

export const taskOf = (row: SkillRow, record: SkillRecord, kind: BackgroundTask['kind']): BackgroundTask => ({
  target: row.target,
  label: row.label,
  entry: row.kit,
  move: row.move,
  kind,
  record,
});

export const KIT_DEBOUNCE_MS = 5000;

export function designMoved(before: ModelHashes | null, after: ModelHashes): boolean {
  if (!before) return false;

  return before.topology !== after.topology || before.physics !== after.physics || before.actuators !== after.actuators;
}

export function backgroundTasks(rows: SkillRow[]): BackgroundTask[] {
  return rows.flatMap((row): BackgroundTask[] => {
    if (!(row.kit || row.move) || !row.record) return [];

    if (row.state.kind === 'recheck') return [taskOf(row, row.record, 'recheck')];

    return row.state.kind === 'untrained' ? [taskOf(row, row.record, 'train')] : [];
  });
}

export class Debounce {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ms: number;

  constructor(ms: number) {
    this.ms = ms;
  }

  run(task: () => void) {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      task();
    }, this.ms);
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);

    this.timer = null;
  }
}
