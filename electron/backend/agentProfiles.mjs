import path from 'node:path';
import { CAD_AGENT_INSTRUCTIONS } from '../cad-agent-prompt.mjs';
import { codexEnv, codexSessionMeta } from './codexProfile.mjs';
import { CAD_MCP_SERVER, geminiEnv } from './geminiProfile.mjs';
import { CLAUDE_AGENT_COMMAND, CODEX_AGENT_COMMAND, GEMINI_AGENT_COMMAND, LEGACY_AGENT_COMMAND } from './constants.mjs';

const OFFLINE_NOTE = "Web tools are off in this session: design from the user's references and your own knowledge.";

export const AGENT_COMMANDS = {
  claude: CLAUDE_AGENT_COMMAND,
  codex: CODEX_AGENT_COMMAND,
  gemini: GEMINI_AGENT_COMMAND,
  offline: LEGACY_AGENT_COMMAND,
};

const KIND_PATTERNS = [
  ['claude', /claude-(agent|code)-acp/],
  ['codex', /codex-acp/],
  ['gemini', /gemini-cli|\bgemini(\.js)?\b/],
  ['offline', /acp-3d-agent/],
];

export function agentKindOf(command) {
  return KIND_PATTERNS.find(([, pattern]) => pattern.test(command ?? ''))?.[0] ?? 'custom';
}

export const isAiAgent = (kind) => kind !== 'offline';

export const cadInstructions = (offline) =>
  offline ? `${CAD_AGENT_INSTRUCTIONS}\n\n${OFFLINE_NOTE}` : CAD_AGENT_INSTRUCTIONS;

const PROCESS_ENV = {
  codex: ({ offline, env, libraryDir }) => codexEnv({ offline, env, configDir: path.join(libraryDir, 'agent-config') }),
  gemini: ({ offline, libraryDir, apiKey }) =>
    geminiEnv({
      offline,
      apiKey,
      configDir: path.join(libraryDir, 'agent-config'),
      instructions: cadInstructions(offline),
    }),
};

const PROCESS_ARGS = { gemini: ['--approval-mode', 'yolo', '--allowed-mcp-server-names', CAD_MCP_SERVER] };

export const agentProcessArgs = (kind) => PROCESS_ARGS[kind] ?? [];

export function agentProcessEnv(kind, context) {
  return PROCESS_ENV[kind]?.(context) ?? {};
}

const isolatedCwd = (libraryDir) => path.join(libraryDir, 'agent-workspace');

export function agentCwd(kind, { workspaceRoot, libraryDir }) {
  return kind === 'codex' || kind === 'gemini' ? isolatedCwd(libraryDir) : workspaceRoot;
}

export function codexMeta(offline) {
  return codexSessionMeta(cadInstructions(offline));
}
