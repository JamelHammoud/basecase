import React from 'react';
import { Markdown } from '../../design-system';
import { AcpToolCallEvent } from '../../types/robotics';
import { designerActivity, designerReport, handbackMessage } from './designerSummary';
import { Segment, stripMarkers } from './messageText';
import { usePartMarkdown } from './PartLinksProvider';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolGroup } from './ToolGroup';
import { groupToolRuns } from './toolGroups';
import { FailureText, ToolStep } from './ToolStep';
import { OpenImages } from './types';
import { useElapsed } from './useElapsed';
import { UserMessage } from './UserMessage';
import { WorkingStatus } from './WorkingStatus';

const briefOf = (call: AcpToolCallEvent) => {
  const prompt = (call.rawInput as { prompt?: unknown } | undefined)?.prompt;

  return typeof prompt === 'string' ? prompt.trim() : '';
};

function feedSegments(call: AcpToolCallEvent, steps: AcpToolCallEvent[]): Segment[] {
  const shown = new Set(steps.map((step) => step.toolCallId));

  if (call.childSegments)
    return call.childSegments.filter((seg) => !('toolCallId' in seg) || shown.has(seg.toolCallId));

  const thought = call.childThought?.trim();

  return [
    ...(thought ? [{ type: 'thought' as const, text: thought }] : []),
    ...steps.map((step) => ({ type: 'tool' as const, toolCallId: step.toolCallId })),
  ];
}

const TextSegment: React.FC<{ text: string }> = ({ text }) => {
  const partLinks = usePartMarkdown();
  const shown = stripMarkers(text);

  return shown ? <Markdown {...partLinks}>{shown}</Markdown> : null;
};

const Segments: React.FC<{ segments: Segment[]; steps: AcpToolCallEvent[]; onOpenImages: OpenImages }> = ({
  segments,
  steps,
  onOpenImages,
}) => {
  const calls = new Map(steps.map((step) => [step.toolCallId, step]));

  return groupToolRuns(segments, calls).map((item) => {
    if (item.kind !== 'segment') return <ToolGroup key={item.index} calls={item.calls} onOpenImages={onOpenImages} />;

    const seg = item.segment;

    if ('toolCallId' in seg) {
      const step = calls.get(seg.toolCallId);

      return step ? <ToolStep key={item.index} call={step} onOpenImages={onOpenImages} /> : null;
    }

    if (seg.type === 'thought') return <ThoughtBlock key={item.index} text={seg.text} live={false} />;

    return <TextSegment key={item.index} text={seg.text} />;
  });
};

function finalReport(call: AcpToolCallEvent, running: boolean) {
  if (running) return '';

  return call.childSegments ? handbackMessage(call) : designerReport(call);
}

export const SubagentFeed: React.FC<{
  call: AcpToolCallEvent;
  steps: AcpToolCallEvent[];
  running: boolean;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onOpenImages: OpenImages;
}> = ({ call, steps, running, contentRef, onOpenImages }) => {
  const partLinks = usePartMarkdown();
  const brief = briefOf(call);
  const segments = feedSegments(call, steps);
  const report = finalReport(call, running);
  const activity = designerActivity(call, steps);
  const elapsed = useElapsed(call.childAt, running);

  return (
    <div ref={contentRef} className="space-y-4 min-w-0">
      {brief && (
        <UserMessage
          msg={{ id: call.toolCallId, role: 'user', text: brief, timestamp: '' }}
          onOpenImages={onOpenImages}
          onContextMenu={() => {}}
        />
      )}
      <div className="space-y-2.5 min-w-0">
        <Segments segments={segments} steps={steps} onOpenImages={onOpenImages} />
        {report && <Markdown {...partLinks}>{report}</Markdown>}
        {running && (
          <WorkingStatus
            status={activity === 'Thinking' ? 'Thinking…' : ''}
            started={segments.length > 0}
            elapsed={elapsed}
          />
        )}
        {call.status === 'failed' && (
          <FailureText text={call.error ? `Couldn’t finish. ${call.error}` : 'Couldn’t finish.'} />
        )}
      </div>
    </div>
  );
};
