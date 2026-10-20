export const CLAUDE_AGENT_COMMAND = 'node node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js';
export const LEGACY_AGENT_COMMAND = 'node electron/acp-3d-agent.mjs';
export const CODEX_AGENT_COMMAND = 'node node_modules/@agentclientprotocol/codex-acp/dist/index.js';
export const GEMINI_AGENT_COMMAND = 'node node_modules/@google/gemini-cli/bundle/gemini.js --acp';

export const SAFE_TOOL_PATTERN =
  /robotics_cad|TodoWrite|WebSearch|WebFetch|^(Agent|Task)\b|\b(write_todos|update_plan|web_fetch|google_web_search)\b/i;

export const CAD_SERVER = 'robotics_cad';

export const MAX_PROMPT_IMAGES = 20;

export const DEFAULT_WORKSPACE = 'main';

export const LANE_SEPARATOR = '__';

export const TOOL_USE_HEADER = 'x-tool-use-id';

export const TOOL_USE_META = 'claudecode/toolUseId';

export const safeWorkspace = (id) =>
  String(id || DEFAULT_WORKSPACE).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_WORKSPACE;

export const safeFileId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
