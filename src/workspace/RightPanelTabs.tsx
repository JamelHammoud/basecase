import type { Readiness } from '../readiness/types';
import { ChatHistory } from '../components/ChatHistory';
import { AgentSpinner, PanelTabs, type PanelTab } from '../design-system';
import { runningChats } from './agentLanes';
import type { RightTab } from './types';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceCore } from './useWorkspaceCore';

interface RightPanelTabsProps {
  core: WorkspaceCore;
  agent: AgentSession;
}

const HISTORY_INSET = 16;

const toFix = (readiness: Readiness | null) =>
  readiness?.blockers.length ? { tone: 'problem' as const, label: `${readiness.blockers.length} to fix` } : undefined;

export function RightPanelTabs({ core, agent }: RightPanelTabsProps) {
  const { studio, tool, posable, posing } = core;
  const { chat, current, lanes } = agent;
  const running = runningChats(lanes.lanes, new Date());
  const hasChats = studio.chatList.length > 0 || running.length > 0;
  const tabs: PanelTab<RightTab>[] = [
    { value: 'inspector', label: 'Inspect' },
    ...(posable ? [{ value: 'pose' as const, label: 'Pose' }] : []),
    ...(posing.hasRig ? [{ value: 'sim' as const, label: 'Simulate' }] : []),
    { value: 'build', label: 'Build', status: toFix(core.readiness.current) },
    {
      value: 'acp',
      label: 'Agent',
      indicator: agent.busy ? <AgentSpinner /> : undefined,
      menu: hasChats
        ? {
            title: 'History',
            className: '!p-0 overflow-hidden',
            content: (close) => (
              <ChatHistory
                chats={studio.chatList}
                running={running}
                currentChatId={current.chatId}
                onOpenChat={chat.openChat}
                onDeleteChat={chat.deleteChat}
                onClose={close}
                width={studio.panelWidths.right - HISTORY_INSET}
              />
            ),
          }
        : undefined,
    },
  ];

  return (
    <div className="h-[44px] shrink-0 flex items-center px-[8px]">
      <PanelTabs<RightTab> label="Inspector" value={tool.rightTab} onChange={tool.setRightTab} tabs={tabs} />
    </div>
  );
}
