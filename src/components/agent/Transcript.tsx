import React from 'react';
import { RotateCcw } from 'lucide-react';
import { AcpChatMessage } from '../../types/robotics';
import { Button } from '../../design-system';
import { AgentMessage } from './AgentMessage';
import { UserMessage } from './UserMessage';
import { OpenImages } from './types';

const lastAgentIdOf = (messages: AcpChatMessage[]) => messages.findLast((m) => m.role === 'agent')?.id;

export const Transcript: React.FC<{
  messages: AcpChatMessage[];
  isBusy: boolean;
  status: string;
  canRevert: boolean;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onRevert: () => void;
  onOpenImages: OpenImages;
}> = ({ messages, isBusy, status, canRevert, contentRef, onRevert, onOpenImages }) => {
  if (messages.length === 0) return <div ref={contentRef} />;

  const lastAgentId = lastAgentIdOf(messages);
  const last = messages[messages.length - 1];

  return (
    <div ref={contentRef} className="space-y-5 min-w-0">
      {messages.map((msg) => {
        if (msg.role === 'user') return <UserMessage key={msg.id} msg={msg} onOpenImages={onOpenImages} />;

        const live = isBusy && msg.id === lastAgentId;

        return (
          <AgentMessage key={msg.id} msg={msg} busy={live} status={live ? status : ''} onOpenImages={onOpenImages} />
        );
      })}
      {!isBusy && canRevert && last?.role === 'agent' && (
        <div className="-mt-2">
          <Button size="xs" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={onRevert}>
            Revert Changes
          </Button>
        </div>
      )}
    </div>
  );
};
