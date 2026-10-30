import type { AcpStatusInfo, AgentKind } from '../types/robotics';

export interface AgentProfile {
  kind: Exclude<AgentKind, 'custom'>;
  label: string;
  name: string;
  command: string;
  hint: string;
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    kind: 'claude',
    label: 'Claude',
    name: 'Claude',
    command: 'node node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
    hint: 'Claude Code on this Mac, with your Claude login',
  },
  {
    kind: 'codex',
    label: 'Codex',
    name: 'Codex',
    command: 'node node_modules/@agentclientprotocol/codex-acp/dist/index.js',
    hint: 'Codex on this Mac, with your ChatGPT login',
  },
  {
    kind: 'gemini',
    label: 'Gemini',
    name: 'Gemini',
    command: 'node node_modules/@google/gemini-cli/bundle/gemini.js --acp',
    hint: 'Gemini CLI on this Mac, with your Google login',
  },
  {
    kind: 'offline',
    label: 'Offline',
    name: 'the agent',
    command: 'node electron/acp-3d-agent.mjs',
    hint: 'Built-in outline tracer, no AI',
  },
];

export const agentProfileOf = (kind: AgentKind | undefined) => AGENT_PROFILES.find((p) => p.kind === kind);

export const agentKindOf = (status: AcpStatusInfo): AgentKind =>
  status.agentKind ?? AGENT_PROFILES.find((p) => p.command === status.agentCommand)?.kind ?? 'custom';
