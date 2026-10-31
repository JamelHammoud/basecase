export interface EffortLevel {
  id: string;
  name: string;
}

export interface AgentModel {
  id: string;
  name: string;
  resolvesTo?: string;
  effortLevels?: EffortLevel[];
}

export interface AgentChoice {
  model?: string;
  effort?: string;
}

export type AgentKind = 'claude' | 'codex' | 'gemini' | 'offline' | 'custom';

export interface AgentSignIn {
  methods: Array<{ id: string; name: string }>;
  apiKey?: boolean;
  message?: string;
}

export interface AcpStatusInfo {
  connected: boolean;
  connecting?: boolean;
  sessionId: string | null;
  agentName: string;
  agentCommand: string;
  agentKind?: AgentKind;
  protocolVersion?: number;
  models?: AgentModel[];
  defaultModel?: string;
  defaultEffort?: string;
  signIn?: AgentSignIn;
  download?: { name: string; percent: number };
  error?: string;
}
