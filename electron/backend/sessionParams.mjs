import path from 'node:path';
import { CAD_AGENT_INSTRUCTIONS } from '../cad-agent-prompt.mjs';
import { resolveCommand } from './agentProcess.mjs';
import { safeWorkspace } from './constants.mjs';

const OFFLINE_NOTE = "Web tools are off in this session: design from the user's references and your own knowledge.";

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
      append: offline ? `${CAD_AGENT_INSTRUCTIONS}\n\n${OFFLINE_NOTE}` : CAD_AGENT_INSTRUCTIONS,
    },
    claudeCode: {
      options: {
        tools: ['TodoWrite', ...web],
        thinking: { type: 'adaptive', display: 'summarized' },
        allowedTools: ['mcp__robotics_cad', 'TodoWrite', ...web],
      },
    },
  };
}

export function buildSessionParams(context, workspaceId) {
  const params = {
    cwd: context.workspaceRoot,
    mcpServers: context.bridgeUrl ? [cadMcpServer(context, workspaceId)] : [],
  };

  if (context.isClaude) params._meta = claudeCodeMeta(context.offline);

  return params;
}
