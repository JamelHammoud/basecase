import React from 'react';
import { AcpChatMessage, AcpToolCallEvent } from '../../types/robotics';
import { Markdown } from '../../design-system';
import { usePartMarkdown } from './PartLinksProvider';
import { PlanCard } from './PlanCard';
import { ThoughtBlock } from './ThoughtBlock';
import { WorkingStatus } from './WorkingStatus';
import { designerName, isDesignerCall, isDesignerRunning } from '../../utils/designers';
import { DesignersCard } from './DesignersCard';
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

  return <ToolStep call={call} onOpenImages={onOpenImages} />;
};

function waitingOn(calls: AcpToolCallEvent[]) {
  const running = calls.filter((call) => isDesignerCall(call) && isDesignerRunning(call));

  if (running.length === 0) return '';

  return running.length === 1 ? `Waiting on ${designerName(running[0])}` : 'Waiting on subagents';
}

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
  const shownStatus = (busy && waitingOn(msg.toolCalls ?? [])) || status;

  return (
    <div className="space-y-2.5 animate-fade-in min-w-0" onContextMenu={onContextMenu}>
      {msg.plan && msg.plan.length > 0 && <PlanCard entries={msg.plan} />}

      {groupToolRuns(segments, calls).map((item) => {
        if (item.kind === 'group') return <ToolGroup key={item.index} calls={item.calls} onOpenImages={onOpenImages} />;

        if (item.kind === 'designers') return <DesignersCard key={item.index} calls={item.calls} />;

        const seg = item.segment;

        if ('toolCallId' in seg)
          return <ToolSegment key={item.index} call={calls.get(seg.toolCallId)} onOpenImages={onOpenImages} />;

        if (seg.type === 'thought')
          return <ThoughtBlock key={item.index} text={seg.text} live={busy && seg === last} />;

        return <TextSegment key={item.index} text={seg.text} />;
      })}

      {busy && (shownStatus || last?.type !== 'thought') && (
        <WorkingStatus status={shownStatus} started={segments.length > 0} />
      )}
      {msg.failed && <div className="text-[12.5px] text-white/40">Couldn’t finish. {msg.failed}</div>}
      {msg.stopped && !msg.failed && <div className="text-[12.5px] text-white/40">Stopped</div>}
    </div>
  );
};
