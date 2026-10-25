import React from 'react';
import { Markdown } from '../../design-system';
import { AcpToolCallEvent } from '../../types/robotics';
import { designerReport } from './designerSummary';
import { usePartMarkdown } from './PartLinksProvider';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolGroup } from './ToolGroup';
import { groupToolRuns } from './toolGroups';
import { isToolRunning } from './toolLabel';
import { ToolStep } from './ToolStep';
import { OpenImages } from './types';
import { UserMessage } from './UserMessage';
import { WorkingStatus } from './WorkingStatus';

const briefOf = (call: AcpToolCallEvent) => {
  const prompt = (call.rawInput as { prompt?: unknown } | undefined)?.prompt;

  return typeof prompt === 'string' ? prompt.trim() : '';
};

const Steps: React.FC<{ steps: AcpToolCallEvent[]; onOpenImages: OpenImages }> = ({ steps, onOpenImages }) => {
  const calls = new Map(steps.map((step) => [step.toolCallId, step]));
  const segments = steps.map((step) => ({ type: 'tool' as const, toolCallId: step.toolCallId }));

  return (
    <div className="space-y-0.5 min-w-0">
      {groupToolRuns(segments, calls).map((item) => {
        if (item.kind === 'segment') {
          const step = 'toolCallId' in item.segment ? calls.get(item.segment.toolCallId) : undefined;

          return step ? <ToolStep key={item.index} call={step} onOpenImages={onOpenImages} /> : null;
        }

        return <ToolGroup key={item.index} calls={item.calls} onOpenImages={onOpenImages} />;
      })}
    </div>
  );
};

export const SubagentFeed: React.FC<{
  call: AcpToolCallEvent;
  steps: AcpToolCallEvent[];
  running: boolean;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onOpenImages: OpenImages;
}> = ({ call, steps, running, contentRef, onOpenImages }) => {
  const partLinks = usePartMarkdown();
  const brief = briefOf(call);
  const thought = call.childThought?.trim() ?? '';
  const report = running ? '' : designerReport(call);
  const thinking = running && !!thought && !steps.some(isToolRunning);

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
        {thought && <ThoughtBlock text={thought} live={thinking} />}
        {steps.length > 0 && <Steps steps={steps} onOpenImages={onOpenImages} />}
        {report && <Markdown {...partLinks}>{report}</Markdown>}
        {running && !thinking && <WorkingStatus status="" started={steps.length > 0} />}
        {call.status === 'failed' && <div className="text-[12.5px] text-white/40">Couldn’t finish.</div>}
      </div>
    </div>
  );
};
