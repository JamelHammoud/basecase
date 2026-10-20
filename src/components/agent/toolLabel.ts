import { ToolIcon as ToolPromptIcon } from '../../design-system';
import { AcpToolCallEvent } from '../../types/robotics';
import { DEFAULT_GROUP_LABEL, GROUP_LABELS } from './toolGroupLabels';
import { HIDDEN_TOOLS, TOOL_RULES, ToolIcon, ToolLabel } from './toolRules';

export type { ToolLabel } from './toolRules';

const MCP_NAME = /^mcp__.+?__/;

export const toolKey = (tc: AcpToolCallEvent) => {
  const name = tc.toolName || tc.title || '';

  return name.replace(MCP_NAME, '').toLowerCase();
};

const ruleOf = (tc: AcpToolCallEvent) => {
  const key = toolKey(tc);

  return TOOL_RULES.find((rule) => rule.keys.includes(key));
};

const isCodeName = (text: string) => MCP_NAME.test(text) || /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text);

const humanized = (text: string) => {
  const words = text.replace(MCP_NAME, '').replace(/_/g, ' ').trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function toolLabel(tc: AcpToolCallEvent): ToolLabel | null {
  if (HIDDEN_TOOLS.includes(toolKey(tc))) return null;

  const rule = ruleOf(tc);
  const done = tc.status === 'completed';

  if (rule) {
    return rule.label({ input: (tc.rawInput ?? {}) as Record<string, unknown>, verb: (ing, ed) => (done ? ed : ing) });
  }

  const title = tc.title || tc.toolName || 'Tool';

  return { title: isCodeName(title) ? humanized(title) : title };
}

export const toolIcon = (tc: AcpToolCallEvent): ToolIcon => ruleOf(tc)?.icon ?? ToolPromptIcon;

export const isToolRunning = (tc: AcpToolCallEvent) => tc.status === 'pending' || tc.status === 'in_progress';

export function groupLabel(calls: AcpToolCallEvent[]): string {
  const [ing, ed] = GROUP_LABELS[toolKey(calls[0])] ?? DEFAULT_GROUP_LABEL;

  return (calls.some(isToolRunning) ? ing : ed).replace('#', String(calls.length));
}
