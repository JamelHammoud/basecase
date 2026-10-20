import React from 'react';
import { AcpChatMessage, AcpToolCallEvent } from '../../types/robotics';
import { Markdown } from '../../design-system';
import { usePartMarkdown } from './PartLinksProvider';
import { PlanCard } from './PlanCard';
import { SHIMMER_TEXT } from './shimmer';
import { ThoughtBlock } from './ThoughtBlock';
import { isSubagentCall, SubagentStep } from './SubagentStep';
import { ToolGroup } from './ToolGroup';
import { groupToolRuns } from './toolGroups';
import { ToolStep } from './ToolStep';
import { OpenImages } from './types';
import { segmentsOf, stripMarkers } from './messageText';

const TextSegment: React.FC<{ text: string }> = ({ text }) => {
  const shown = stripMarkers(text);
  const partLinks = usePartMarkdown();

  return shown ? <Markdown {...partLinks}>{shown}</Markdown> : null;
};

const ToolSegment: React.FC<{ call: AcpToolCallEvent | undefined; onOpenImages: OpenImages }> = ({
  call,
  onOpenImages,
}) => {
  if (!call) return null;

  if (isSubagentCall(call)) return <SubagentStep call={call} onOpenImages={onOpenImages} />;

  return <ToolStep call={call} onOpenImages={onOpenImages} />;
};

const WorkingStatus: React.FC<{ status: string; started: boolean }> = ({ status, started }) => (
  <div className="flex items-center gap-2 h-6 text-[13.5px]">
    <span className={SHIMMER_TEXT}>{status || (started ? 'Working…' : 'Thinking…')}</span>
  </div>
);

export const AgentMessage: React.FC<{
  msg: AcpChatMessage;
  busy: boolean;
  status: string;
  onOpenImages: OpenImages;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({ msg, busy, status, onOpenImages, onContextMenu }) => {
  const calls = new Map((msg.toolCalls ?? []).map((tc) => [tc.toolCallId, tc]));
  const segments = segmentsOf(msg);
  const last = segments[segments.length - 1];

  return (
    <div className="space-y-2.5 animate-fade-in min-w-0" onContextMenu={onContextMenu}>
      {msg.plan && msg.plan.length > 0 && <PlanCard entries={msg.plan} />}

      {groupToolRuns(segments, calls).map((item) => {
        if (item.kind === 'group') return <ToolGroup key={item.index} calls={item.calls} onOpenImages={onOpenImages} />;

        const seg = item.segment;

        if ('toolCallId' in seg)
          return <ToolSegment key={item.index} call={calls.get(seg.toolCallId)} onOpenImages={onOpenImages} />;

        if (seg.type === 'thought')
          return <ThoughtBlock key={item.index} text={seg.text} live={busy && seg === last} />;

        return <TextSegment key={item.index} text={seg.text} />;
      })}

      {busy && (status || last?.type !== 'thought') && <WorkingStatus status={status} started={segments.length > 0} />}
      {msg.stopped && <div className="text-[12.5px] text-white/40">Stopped</div>}
    </div>
  );
};
