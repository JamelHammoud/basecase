import React, { useState } from 'react';
import { AcpChatMessage, MessageQuote } from '../../types/robotics';
import { ContextMenu, ContextMenuEntry } from '../../design-system';
import { AgentMessage } from './AgentMessage';
import { ReplyActions } from './ReplyActions';
import { UserMessage } from './UserMessage';
import { OpenImages } from './types';
import { messageMenuItems } from './messageText';

const MENU_MIN_WIDTH = 160;

const lastAgentIdOf = (messages: AcpChatMessage[]) => messages.findLast((m) => m.role === 'agent')?.id;

export const Transcript: React.FC<{
  messages: AcpChatMessage[];
  isBusy: boolean;
  status: string;
  canRevert: boolean;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onContinue: () => void;
  onRetry: () => void;
  onRevert: () => void;
  onOpenImages: OpenImages;
  onQuote: (quote: MessageQuote) => void;
}> = ({ messages, isBusy, status, canRevert, contentRef, onContinue, onRetry, onRevert, onOpenImages, onQuote }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  if (messages.length === 0) return <div ref={contentRef} />;

  const openMenu = (e: React.MouseEvent, msg: AcpChatMessage) => {
    const items = messageMenuItems(msg, onQuote);

    if (items.length === 0) return;

    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const lastAgentId = lastAgentIdOf(messages);
  const last = messages[messages.length - 1];

  return (
    <div ref={contentRef} className="space-y-5 min-w-0">
      {messages.map((msg) => {
        if (msg.role === 'user')
          return (
            <UserMessage key={msg.id} msg={msg} onOpenImages={onOpenImages} onContextMenu={(e) => openMenu(e, msg)} />
          );

        const live = isBusy && msg.id === lastAgentId;

        return (
          <AgentMessage
            key={msg.id}
            msg={msg}
            busy={live}
            status={live ? status : ''}
            onOpenImages={onOpenImages}
            onContextMenu={(e) => openMenu(e, msg)}
          />
        );
      })}
      {!isBusy && last?.role === 'agent' && (
        <ReplyActions
          reply={last}
          canRevert={canRevert}
          onContinue={onContinue}
          onRetry={onRetry}
          onRevert={onRevert}
        />
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} minWidth={MENU_MIN_WIDTH} onClose={() => setMenu(null)} />
      )}
    </div>
  );
};
