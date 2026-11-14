import type { TrySegment } from './tryLabels';

const LIMIT = 50;

export interface SegmentHistory {
  now: TrySegment[];
  canUndo: boolean;
  canRedo: boolean;
  apply: (next: TrySegment[]) => SegmentHistory;
  undo: () => SegmentHistory | null;
  redo: () => SegmentHistory | null;
}

function historyOf(past: TrySegment[][], now: TrySegment[], future: TrySegment[][]): SegmentHistory {
  return {
    now,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    apply: (next) => historyOf([...past, now].slice(-LIMIT), next, []),
    undo: () => (past.length ? historyOf(past.slice(0, -1), past[past.length - 1], [now, ...future]) : null),
    redo: () => (future.length ? historyOf([...past, now], future[0], future.slice(1)) : null),
  };
}

export const segmentHistory = (segments: TrySegment[]) => historyOf([], segments, []);
