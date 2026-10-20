export interface AcpToolCallEvent {
  toolCallId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  kind?: string;
  rawInput?: unknown;
  toolName?: string;
  children?: AcpToolCallEvent[];
  childText?: string;
}

export interface AcpPlanEntry {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AcpChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  thought?: string;
  timestamp: string;
  imageAttachment?: string;
  imageAttachments?: string[];
  folderAttachments?: Array<{ id: string; name: string; fileCount: number }>;
  queued?: boolean;
  notSent?: boolean;
  toolCalls?: AcpToolCallEvent[];
  segments?: Array<{ type: 'thought' | 'text'; text: string } | { type: 'tool'; toolCallId: string }>;
  plan?: AcpPlanEntry[];
  createdModelId?: string;
  stopped?: boolean;
}

export interface AgentConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentConversation {
  id: string;
  title: string;
  acpSessionId: string | null;
  createdAt: string;
  updatedAt?: string;
  messages: AcpChatMessage[];
}
