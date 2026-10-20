import React, { useState } from 'react';
import { AcpChatMessage } from '../../types/robotics';
import { Button, ContextMenu, ContextMenuEntry, RotateLeftIcon } from '../../design-system';
import { AgentMessage } from './AgentMessage';
import { UserMessage } from './UserMessage';
import { OpenImages } from './types';
import { copyMenuItems, messageText } from './messageText';

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
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  if (messages.length === 0) return <div ref={contentRef} />;

  const openMenu = (e: React.MouseEvent, msg: AcpChatMessage) => {
    const items = copyMenuItems(messageText(msg));

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
      {!isBusy && canRevert && last?.role === 'agent' && (
        <div className="-mt-2">
          <Button size="xs" variant="ghost" icon={<RotateLeftIcon className="w-3.5 h-3.5" />} onClick={onRevert}>
            Revert Changes
          </Button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
