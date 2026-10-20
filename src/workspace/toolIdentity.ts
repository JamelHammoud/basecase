interface ToolUpdate {
  toolCallId?: unknown;
  title?: unknown;
  rawInput?: unknown;
  _meta?: unknown;
}

interface McpInput {
  server?: unknown;
  tool?: unknown;
  arguments?: unknown;
}

export interface ToolIdentity {
  toolName?: string;
  rawInput?: unknown;
}

const DOTTED_MCP = /^mcp\.([\w-]+)\.([\w-]+)$/;
const GENERATED_ID = /^([\w-]+?)-\d{10,}-\d+$/;
const SERVER_TOOL = /^([\w-]+?)__([\w-]+)$/;

const mcpName = (server: string, tool: string) => `mcp__${server}__${tool}`;

function fromCallId(id: string): string | undefined {
  const name = id.match(GENERATED_ID)?.[1];

  if (!name) return undefined;

  const parts = name.match(SERVER_TOOL);

  return parts ? mcpName(parts[1], parts[2]) : name;
}

export function toolIdentity(u: ToolUpdate): ToolIdentity {
  const claudeName = (u._meta as { claudeCode?: { toolName?: string } } | undefined)?.claudeCode?.toolName;

  if (claudeName) return { toolName: claudeName, rawInput: u.rawInput };

  const input = u.rawInput as McpInput | undefined;

  if (typeof input?.server === 'string' && typeof input.tool === 'string') {
    return { toolName: mcpName(input.server, input.tool), rawInput: input.arguments ?? {} };
  }

  const dotted = String(u.title ?? '').match(DOTTED_MCP);
  const toolName = dotted ? mcpName(dotted[1], dotted[2]) : fromCallId(String(u.toolCallId ?? ''));

  return { toolName, rawInput: u.rawInput };
}
