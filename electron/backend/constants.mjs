export const CLAUDE_AGENT_COMMAND = 'node node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js';
export const LEGACY_AGENT_COMMAND = 'node electron/acp-3d-agent.mjs';
export const CODEX_AGENT_COMMAND = 'node node_modules/@agentclientprotocol/codex-acp/dist/index.js';
export const GEMINI_AGENT_COMMAND = 'node node_modules/@google/gemini-cli/bundle/gemini.js --acp';

export const SAFE_TOOL_PATTERN =
  /robotics_cad|TodoWrite|WebSearch|WebFetch|\b(write_todos|update_plan|web_fetch|google_web_search)\b/i;

export const CAD_SERVER = 'robotics_cad';

export const PART_DESIGNER = 'part-designer';

export const BLOCKED_SUBAGENTS = ['general-purpose', 'statusline-setup'];

export const SUBAGENT_TOOLS = ['Agent', 'Task'];

export const MAX_PROMPT_IMAGES = 20;

export const DEFAULT_WORKSPACE = 'main';

export const LANE_SEPARATOR = '__';

export const TOOL_USE_HEADER = 'x-tool-use-id';

export const TOOL_USE_META = 'claudecode/toolUseId';

export const safeWorkspace = (id) =>
  String(id || DEFAULT_WORKSPACE).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_WORKSPACE;

export const safeFileId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');

export const isSafeFileId = (id) => typeof id === 'string' && /^[\w-]{1,128}$/.test(id);

export function checkedFileId(id) {
  if (!isSafeFileId(id)) throw new Error(`Not a valid id: ${String(id).slice(0, 40)}`);

  return id;
}
