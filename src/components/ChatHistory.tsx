import React from 'react';
import { AgentConversationSummary } from '../types/robotics';
import { groupByDate } from '../utils/dateGroups';
import { timeAgo } from '../utils/timeAgo';
import { AgentSpinner, IconButton, useScrollFade, DeleteIcon, confirmAction } from '../design-system';

interface ChatHistoryProps {
  chats: AgentConversationSummary[];
  running: AgentConversationSummary[];
  currentChatId: string | null;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
  width: number;
}

type RowState = 'current' | 'idle';

const ROW_FILL: Record<RowState, string> = {
  current: 'bg-white/[0.08]',
  idle: 'hover:bg-white/[0.05]',
};

const ROW_TEXT: Record<RowState, string> = {
  current: 'text-white/95 font-medium',
  idle: 'text-white/75 group-hover/chat:text-white/95',
};

const ChatRow: React.FC<{
  chat: AgentConversationSummary;
  current: boolean;
  running: boolean;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
}> = ({ chat: c, current, running, onOpenChat, onDeleteChat, onClose }) => {
  const state: RowState = current ? 'current' : 'idle';

  return (
    <div
      className={`group/chat relative h-[34px] flex items-center rounded-[8px] transition-colors duration-150 ${ROW_FILL[state]}`}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();

          if (!current) onOpenChat(c.id);
        }}
        className="absolute inset-0 rounded-[8px] cursor-default"
        aria-current={current || undefined}
        aria-label={c.title}
      />
      <span
        className={`relative pointer-events-none flex-1 min-w-0 pl-[10px] pr-2 flex items-center gap-2 text-[13px] ${ROW_TEXT[state]}`}
      >
        {running && <AgentSpinner />}
        <span className="truncate">{c.title}</span>
      </span>
      <span className="relative shrink-0 min-w-[40px] h-full mr-[3px] flex items-center justify-end">
        <span className="pr-[7px] whitespace-nowrap text-[12px] tabular-nums text-white/50 transition-opacity duration-150 group-hover/chat:opacity-0 group-focus-within/chat:opacity-0">
          {running ? '' : timeAgo(c.updatedAt)}
        </span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover/chat:opacity-100 group-hover/chat:pointer-events-auto group-focus-within/chat:opacity-100 group-focus-within/chat:pointer-events-auto">
          <IconButton
            icon={<DeleteIcon className="w-3.5 h-3.5" />}
            title="Delete"
            tooltipSide="right"
            variant="danger"
            size="xs"
            onClick={() =>
              confirmAction({
                title: `Delete ${c.title}?`,
                onConfirm: () => onDeleteChat(c.id),
              })
            }
          />
        </span>
      </span>
    </div>
  );
};

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  chats,
  running,
  currentChatId,
  onOpenChat,
  onDeleteChat,
  onClose,
  width,
}) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();

  const runningIds = new Set(running.map((c) => c.id));
  const saved = chats.filter((c) => !runningIds.has(c.id));

  const groups = [...(running.length ? [{ label: 'Running', items: running }] : []), ...groupByDate(saved, new Date())];

  return (
    <div
      ref={setFadeEl}
      style={{ ...fadeStyle, width }}
      className="max-h-[min(520px,70vh)] overflow-y-auto overflow-x-hidden [--pad-x:6px] p-[var(--pad-x)]"
    >
      {groups.map((g, i) => (
        <section key={g.label} className={i > 0 ? 'mt-2' : ''}>
          <h3 className="px-[10px] pt-[6px] pb-[4px] text-[12px] font-medium text-white/50 select-none">{g.label}</h3>
          {g.items.map((c) => (
            <ChatRow
              key={c.id}
              chat={c}
              current={c.id === currentChatId}
              running={runningIds.has(c.id)}
              onOpenChat={onOpenChat}
              onDeleteChat={onDeleteChat}
              onClose={onClose}
            />
          ))}
        </section>
      ))}
    </div>
  );
};
