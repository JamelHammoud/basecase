import type { ModelHashes } from './artifacts';
import type { TrainedEntry } from './kitEnvironment';
import type { SkillRecord } from './skillRecords';
import type { SkillRow } from './skillRows';

export interface BackgroundTask {
  entry: TrainedEntry;
  kind: 'recheck' | 'train';
  record: SkillRecord;
}

export const KIT_DEBOUNCE_MS = 5000;

export function designMoved(before: ModelHashes | null, after: ModelHashes): boolean {
  if (!before) return false;

  return before.topology !== after.topology || before.physics !== after.physics || before.actuators !== after.actuators;
}

export function backgroundTasks(rows: SkillRow[]): BackgroundTask[] {
  return rows.flatMap((row): BackgroundTask[] => {
    if (!row.kit || !row.record) return [];

    if (row.state.kind === 'recheck') return [{ entry: row.kit, kind: 'recheck', record: row.record }];

    return row.state.kind === 'untrained' ? [{ entry: row.kit, kind: 'train', record: row.record }] : [];
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
