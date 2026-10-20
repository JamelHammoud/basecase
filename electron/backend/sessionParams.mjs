import path from 'node:path';
import { cadInstructions, codexMeta } from './agentProfiles.mjs';
import { resolveCommand } from './agentProcess.mjs';
import { safeWorkspace } from './constants.mjs';
import { cadSubagents } from './subagents.mjs';

function cadMcpServer({ workspaceRoot, bridgeUrl, evidenceDir, referencesDir, offline }, workspaceId) {
  const [nodeCmd] = resolveCommand('node');

  return {
    name: 'robotics_cad',
    command: nodeCmd,
    args: [path.join(workspaceRoot, 'electron', 'cad-mcp-server.mjs')],
    env: [
      { name: 'CAD_BRIDGE_URL', value: `${bridgeUrl}/w/${safeWorkspace(workspaceId)}` },
      { name: 'CAD_EVIDENCE_DIR', value: evidenceDir },
      { name: 'CAD_REFERENCES_DIR', value: referencesDir },
      ...(offline ? [{ name: 'CAD_NO_WEB', value: '1' }] : []),
    ],
  };
}

function claudeCodeMeta(offline) {
  const web = offline ? [] : ['WebSearch', 'WebFetch'];

  return {
    systemPrompt: {
      append: cadInstructions(offline),
    },
    claudeCode: {
      options: {
        tools: ['TodoWrite', 'Agent', ...web],
        thinking: { type: 'adaptive', display: 'summarized' },
        allowedTools: ['mcp__robotics_cad', 'TodoWrite', 'Agent', ...web],
        agents: cadSubagents(),
      },
    },
  };
}

const SESSION_META = { claude: claudeCodeMeta, codex: codexMeta };

export function buildSessionParams(context, workspaceId) {
  const params = {
    cwd: context.cwd ?? context.workspaceRoot,
    mcpServers: context.bridgeUrl ? [cadMcpServer(context, workspaceId)] : [],
  };
  const meta = SESSION_META[context.kind]?.(context.offline);

  if (meta) params._meta = meta;

  return params;
}
