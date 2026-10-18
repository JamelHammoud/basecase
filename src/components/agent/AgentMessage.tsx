import React from 'react';
import { AcpChatMessage, AcpToolCallEvent } from '../../types/robotics';
import { Markdown } from '../../design-system';
import { PlanCard } from './PlanCard';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolStep } from './ToolStep';
import { OpenImages } from './types';

type Segment = NonNullable<AcpChatMessage['segments']>[number];

const MODEL_CREATED = /\[MODEL_CREATED:[^\]]+\]/g;

const stripMarkers = (text: string) => text.replace(MODEL_CREATED, '').trim();

function segmentsOf(msg: AcpChatMessage): Segment[] {
  if (msg.segments) return msg.segments;

  const text = stripMarkers(msg.text);

  return [
    ...(msg.thought ? [{ type: 'thought' as const, text: msg.thought }] : []),
    ...(msg.toolCalls ?? []).map((tc) => ({ type: 'tool' as const, toolCallId: tc.toolCallId })),
    ...(text ? [{ type: 'text' as const, text }] : []),
  ];
}

const TextSegment: React.FC<{ text: string }> = ({ text }) => {
  const shown = stripMarkers(text);

  return shown ? <Markdown>{shown}</Markdown> : null;
};

const ToolSegment: React.FC<{ call: AcpToolCallEvent | undefined; onOpenImages: OpenImages }> = ({
  call,
  onOpenImages,
}) => (call ? <ToolStep call={call} onOpenImages={onOpenImages} /> : null);

const WorkingStatus: React.FC<{ status: string; started: boolean }> = ({ status, started }) => (
  <div className="flex items-center gap-2 h-6 text-[13.5px]">
    <span className="bg-[linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.9),rgba(255,255,255,0.35))] bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
      {status || (started ? 'Working…' : 'Thinking…')}
    </span>
  </div>
);

export const AgentMessage: React.FC<{
  msg: AcpChatMessage;
  busy: boolean;
  status: string;
  onOpenImages: OpenImages;
}> = ({ msg, busy, status, onOpenImages }) => {
  const calls = new Map((msg.toolCalls ?? []).map((tc) => [tc.toolCallId, tc]));
  const segments = segmentsOf(msg);
  const last = segments[segments.length - 1];

  return (
    <div className="space-y-2.5 animate-fade-in min-w-0">
      {msg.plan && msg.plan.length > 0 && <PlanCard entries={msg.plan} />}

      {segments.map((seg, i) => {
        if ('toolCallId' in seg)
          return <ToolSegment key={i} call={calls.get(seg.toolCallId)} onOpenImages={onOpenImages} />;

        if (seg.type === 'thought') return <ThoughtBlock key={i} text={seg.text} live={busy && seg === last} />;

        return <TextSegment key={i} text={seg.text} />;
      })}

      {busy && (status || last?.type !== 'thought') && <WorkingStatus status={status} started={segments.length > 0} />}
      {msg.stopped && <div className="text-[12.5px] text-white/40">Stopped</div>}
    </div>
  );
};
