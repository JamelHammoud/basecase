import { AcpToolCallEvent } from '../../types/robotics';
import { isDesignerCall } from '../../utils/designers';
import { Segment } from './messageText';
import { toolKey, toolLabel } from './toolLabel';

export type FeedItem =
  | { kind: 'segment'; segment: Segment; index: number }
  | { kind: 'group'; calls: AcpToolCallEvent[]; index: number }
  | { kind: 'designers'; calls: AcpToolCallEvent[]; index: number };

const MIN_GROUP = 3;

interface Run {
  key: string;
  items: { segment: Segment; index: number; call: AcpToolCallEvent }[];
}

class FeedBuilder {
  readonly items: FeedItem[] = [];

  private run: Run | null = null;

  private designers: { calls: AcpToolCallEvent[]; index: number } | null = null;

  add(segment: Segment, index: number, call: AcpToolCallEvent | undefined) {
    if (call && isDesignerCall(call)) {
      this.flushRun();
      this.addDesigner(call, index);

      return;
    }

    this.flushDesigners();

    const key = call ? toolKey(call) : '';

    if (call && this.run?.key === key) {
      this.run.items.push({ segment, index, call });

      return;
    }

    this.flushRun();

    if (call) this.run = { key, items: [{ segment, index, call }] };
    else this.items.push({ kind: 'segment', segment, index });
  }

  finish() {
    this.flushRun();
    this.flushDesigners();

    return this.items;
  }

  private addDesigner(call: AcpToolCallEvent, index: number) {
    if (this.designers) this.designers.calls.push(call);
    else this.designers = { calls: [call], index };
  }

  private flushDesigners() {
    if (this.designers) this.items.push({ kind: 'designers', ...this.designers });

    this.designers = null;
  }

  private flushRun() {
    const run = this.run;

    this.run = null;

    if (!run) return;

    if (run.items.length < MIN_GROUP) {
      this.items.push(...run.items.map(({ segment, index }) => ({ kind: 'segment' as const, segment, index })));

      return;
    }

    this.items.push({ kind: 'group', calls: run.items.map((item) => item.call), index: run.items[0].index });
  }
}

const callOf = (segment: Segment, calls: Map<string, AcpToolCallEvent>) =>
  'toolCallId' in segment ? calls.get(segment.toolCallId) : undefined;

export function groupToolRuns(segments: Segment[], calls: Map<string, AcpToolCallEvent>): FeedItem[] {
  const builder = new FeedBuilder();

  segments.forEach((segment, index) => {
    const call = callOf(segment, calls);

    if (call && !toolLabel(call)) return;

    builder.add(segment, index, call);
  });

  return builder.finish();
}
