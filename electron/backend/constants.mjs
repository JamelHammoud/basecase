export const CLAUDE_AGENT_COMMAND = 'node node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js';
export const LEGACY_AGENT_COMMAND = 'node electron/acp-3d-agent.mjs';

export const SAFE_TOOL_PATTERN = /robotics_cad|TodoWrite|WebSearch|WebFetch/i;

export const MAX_PROMPT_IMAGES = 20;

export const DEFAULT_WORKSPACE = 'main';

export const safeWorkspace = (id) =>
  String(id || DEFAULT_WORKSPACE).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_WORKSPACE;

export const safeFileId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
