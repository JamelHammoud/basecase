import React from 'react';
import { Trash2 } from 'lucide-react';
import { AgentConversationSummary } from '../types/robotics';
import { timeAgo } from '../utils/timeAgo';
import { AgentSpinner, Tooltip, useScrollFade } from '../design-system';

interface ChatHistoryProps {
  chats: AgentConversationSummary[];
  currentChatId: string | null;
  busy?: boolean;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
  width: number;
}

const DAY = 86_400_000;

function groupLabel(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = Date.parse(iso);

  if (t >= startOfToday) return 'Today';

  if (t >= startOfToday - DAY) return 'Yesterday';

  if (t >= startOfToday - 7 * DAY) return 'Previous 7 days';

  const d = new Date(t);

  return d.toLocaleDateString(
    undefined,
    d.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' },
  );
}

type RowState = 'current' | 'locked' | 'idle';

const ROW_FILL: Record<RowState, string> = {
  current: 'bg-white/[0.08]',
  locked: '',
  idle: 'hover:bg-white/[0.05]',
};

const ROW_TEXT: Record<RowState, string> = {
  current: 'text-white/95 font-medium',
  locked: 'text-white/35',
  idle: 'text-white/75 group-hover/chat:text-white/95',
};

function rowState(current: boolean, busy: boolean | undefined): RowState {
  if (current) return 'current';

  return busy ? 'locked' : 'idle';
}

function groupChats(chats: AgentConversationSummary[], now: Date) {
  const groups: { label: string; chats: AgentConversationSummary[] }[] = [];

  for (const c of [...chats].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const label = groupLabel(c.updatedAt, now);
    const last = groups[groups.length - 1];

    if (last?.label === label) last.chats.push(c);
    else groups.push({ label, chats: [c] });
  }

  return groups;
}

const ChatRow: React.FC<{
  chat: AgentConversationSummary;
  current: boolean;
  busy?: boolean;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
}> = ({ chat: c, current, busy, onOpenChat, onDeleteChat, onClose }) => {
  const state = rowState(current, busy);

  return (
    <div
      className={`group/chat relative h-[34px] flex items-center rounded-[8px] transition-colors duration-150 ${ROW_FILL[state]}`}
    >
      <button
        type="button"
        role="menuitem"
        disabled={state === 'locked'}
        onClick={() => {
          onClose();

          if (!current) onOpenChat(c.id);
        }}
        className="absolute inset-0 rounded-[8px] cursor-default disabled:cursor-default"
        aria-current={current || undefined}
        aria-label={c.title}
      />
      <span
        className={`relative pointer-events-none flex-1 min-w-0 pl-[10px] pr-2 flex items-center gap-2 text-[13px] ${ROW_TEXT[state]}`}
      >
        {current && busy && <AgentSpinner />}
        <span className="truncate">{c.title}</span>
      </span>
      <span className="relative shrink-0 w-[40px] h-full mr-[4px] flex items-center justify-end">
        <span className="pr-[6px] text-[12px] tabular-nums text-white/35 transition-opacity duration-150 group-hover/chat:opacity-0 group-focus-within/chat:opacity-0">
          {timeAgo(c.updatedAt)}
        </span>
        <Tooltip label="Delete chat" side="right">
          <button
            type="button"
            aria-label="Delete chat"
            onClick={() => onDeleteChat(c.id)}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-white/45 hover:text-red-400 hover:bg-red-500/15 cursor-default opacity-0 scale-90 transition-[opacity,scale,color,background-color] duration-150 group-hover/chat:opacity-100 group-hover/chat:scale-100 focus-visible:opacity-100 focus-visible:scale-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </span>
    </div>
  );
};

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  chats,
  currentChatId,
  busy,
  onOpenChat,
  onDeleteChat,
  onClose,
  width,
}) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();

  if (chats.length === 0) {
    return (
      <div style={{ width }} className="px-4 py-5 text-center text-[13px] text-white/45">
        No chats
      </div>
    );
  }

  const groups = groupChats(chats, new Date());

  return (
    <div
      ref={setFadeEl}
      style={{ ...fadeStyle, width }}
      className="max-h-[min(520px,70vh)] overflow-y-auto overflow-x-hidden [--pad-x:6px] p-[var(--pad-x)]"
    >
      {groups.map((g, i) => (
        <section key={g.label} className={i > 0 ? 'mt-2' : ''}>
          <h3 className="px-[10px] pt-[6px] pb-[4px] text-[12px] font-medium text-white/40 select-none">{g.label}</h3>
          {g.chats.map((c) => (
            <ChatRow
              key={c.id}
              chat={c}
              current={c.id === currentChatId}
              busy={busy}
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
