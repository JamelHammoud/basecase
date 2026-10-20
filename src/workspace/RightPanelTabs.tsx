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

export function RightPanelTabs({ core, agent }: RightPanelTabsProps) {
  const { studio, tool, onRobot, posing } = core;
  const { chat, current, lanes } = agent;
  const tabs: PanelTab<RightTab>[] = [
    { value: 'inspector', label: 'Inspect' },
    ...(onRobot ? [{ value: 'pose' as const, label: 'Pose' }] : []),
    ...(posing.hasRig ? [{ value: 'sim' as const, label: 'Simulate' }] : []),
    { value: 'build', label: 'Build' },
    {
      value: 'acp',
      label: 'Agent',
      indicator: agent.busy ? <AgentSpinner /> : undefined,
      menu: {
        title: 'History',
        className: '!p-0 overflow-hidden',
        content: (close) => (
          <ChatHistory
            chats={studio.chatList}
            running={runningChats(lanes.lanes, new Date())}
            currentChatId={current.chatId}
            onOpenChat={chat.openChat}
            onDeleteChat={chat.deleteChat}
            onClose={close}
            width={studio.panelWidths.right - HISTORY_INSET}
          />
        ),
      },
    },
  ];

  return (
    <div className="h-[44px] shrink-0 flex items-center px-[8px]">
      <PanelTabs<RightTab> label="Inspector" value={tool.rightTab} onChange={tool.setRightTab} tabs={tabs} />
    </div>
  );
}
