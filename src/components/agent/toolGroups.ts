import { AcpToolCallEvent } from '../../types/robotics';
import { Segment } from './messageText';
import { toolKey, toolLabel } from './toolLabel';

export type FeedItem =
  { kind: 'segment'; segment: Segment; index: number } | { kind: 'group'; calls: AcpToolCallEvent[]; index: number };

const MIN_GROUP = 3;
const UNGROUPED = new Set(['agent', 'task']);

interface Run {
  key: string;
  items: { segment: Segment; index: number; call: AcpToolCallEvent }[];
}

const flush = (run: Run | null): FeedItem[] => {
  if (!run) return [];

  if (run.items.length < MIN_GROUP) return run.items.map(({ segment, index }) => ({ kind: 'segment', segment, index }));

  return [{ kind: 'group', calls: run.items.map((item) => item.call), index: run.items[0].index }];
};

const callOf = (segment: Segment, calls: Map<string, AcpToolCallEvent>) =>
  'toolCallId' in segment ? calls.get(segment.toolCallId) : undefined;

export function groupToolRuns(segments: Segment[], calls: Map<string, AcpToolCallEvent>): FeedItem[] {
  const items: FeedItem[] = [];
  let run: Run | null = null;

  segments.forEach((segment, index) => {
    const call = callOf(segment, calls);

    if (call && !toolLabel(call)) return;

    const key = call ? toolKey(call) : '';

    if (call && !UNGROUPED.has(key) && run?.key === key) {
      run.items.push({ segment, index, call });

      return;
    }

    items.push(...flush(run));
    run = call && !UNGROUPED.has(key) ? { key, items: [{ segment, index, call }] } : null;

    if (!run) items.push({ kind: 'segment', segment, index });
  });

  return [...items, ...flush(run)];
}
