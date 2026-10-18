import React from 'react';
import { Trash2 } from 'lucide-react';
import { AgentConversationSummary } from '../types/robotics';
import { timeAgo } from '../utils/timeAgo';
import { AgentSpinner, Tooltip, useScrollFade } from '../design-system';

interface ChatHistoryProps {
  chats: AgentConversationSummary[];
  currentChatId: string | null;
  /** The agent is working: the current chat shows Claude's spinner, and others can't be opened */
  busy?: boolean;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  /** Closes the popover holding the list */
  onClose: () => void;
  /** Spans the panel it opens from */
  width: number;
}

const DAY = 86_400_000;

/** Today, Yesterday, Previous 7 days, then one group per month */
function groupLabel(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = Date.parse(iso);
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - DAY) return 'Yesterday';
  if (t >= startOfToday - 7 * DAY) return 'Previous 7 days';
  const d = new Date(t);
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
}

/** Saved agent conversations, newest first, grouped by when they were last used: the Agent tab's menu */
export const ChatHistory: React.FC<ChatHistoryProps> = ({
  chats,
  currentChatId,
  busy,
  onOpenChat,
  onDeleteChat,
  onClose,
  width,
}) => {
  const fade = useScrollFade();

  if (chats.length === 0) {
    return (
      <div style={{ width }} className="px-4 py-5 text-center text-[13px] text-white/45">
        No chats
      </div>
    );
  }

  const now = new Date();
  const groups: { label: string; chats: AgentConversationSummary[] }[] = [];
  for (const c of [...chats].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const label = groupLabel(c.updatedAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.chats.push(c);
    else groups.push({ label, chats: [c] });
  }

  return (
    <div
      ref={fade.ref}
      style={{ ...fade.style, width }}
      className="max-h-[min(520px,70vh)] overflow-y-auto overflow-x-hidden [--pad-x:6px] p-[var(--pad-x)]"
    >
      {groups.map((g, i) => (
        <section key={g.label} className={i > 0 ? 'mt-2' : ''}>
          <h3 className="px-[10px] pt-[6px] pb-[4px] text-[12px] font-medium text-white/40 select-none">{g.label}</h3>
          {g.chats.map((c) => {
            const current = c.id === currentChatId;
            const locked = busy && !current;
            return (
              <div
                key={c.id}
                className={`group/chat relative h-[34px] flex items-center rounded-[8px] transition-colors duration-150 ${
                  current ? 'bg-white/[0.08]' : locked ? '' : 'hover:bg-white/[0.05]'
                }`}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={locked}
                  onClick={() => {
                    onClose();
                    if (!current) onOpenChat(c.id);
                  }}
                  className="absolute inset-0 rounded-[8px] cursor-default disabled:cursor-default"
                  aria-current={current || undefined}
                  aria-label={c.title}
                />
                <span
                  className={`relative pointer-events-none flex-1 min-w-0 pl-[10px] pr-2 flex items-center gap-2 text-[13px] ${
                    current ? 'text-white/95 font-medium' : locked ? 'text-white/35' : 'text-white/75 group-hover/chat:text-white/95'
                  }`}
                >
                  {current && busy && <AgentSpinner />}
                  <span className="truncate">{c.title}</span>
                </span>
                {/* Time, swapped for Delete on hover */}
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
          })}
        </section>
      ))}
    </div>
  );
};
