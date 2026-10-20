import { describe, expect, it } from 'vitest';
import { toolLabel } from '../components/agent/toolLabel';
import { applySessionUpdate, emptyAgentMessage } from './acpTranscript';
import { toolIdentity } from './toolIdentity';

const now = new Date('2026-10-19T12:00:00Z');

const stepTitles = (updates: Array<Record<string, unknown>>) => {
  const messages = updates.reduce((prev, u) => applySessionUpdate(prev, u, now), [emptyAgentMessage(now)]);

  return (messages.at(-1)?.toolCalls ?? []).map((call) => toolLabel(call)?.title);
};

describe('tool identity across agents', () => {
  it('labels Claude Code, Codex and Gemini CAD calls the same way', () => {
    const claude = {
      sessionUpdate: 'tool_call',
      toolCallId: 'c1',
      title: 'mcp__robotics_cad__model_part',
      status: 'in_progress',
      rawInput: { name: 'Left Coxa Bracket' },
      _meta: { claudeCode: { toolName: 'mcp__robotics_cad__model_part' } },
    };
    const codex = {
      sessionUpdate: 'tool_call',
      toolCallId: 'exec-1',
      title: 'mcp.robotics_cad.model_part',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { server: 'robotics_cad', tool: 'model_part', arguments: { name: 'Left Coxa Bracket' } },
    };

    expect(stepTitles([claude])).toEqual(['Designing Left Coxa Bracket']);
    expect(stepTitles([codex])).toEqual(['Designing Left Coxa Bracket']);
    expect(
      stepTitles([codex, { sessionUpdate: 'tool_call_update', toolCallId: 'exec-1', status: 'completed' }]),
    ).toEqual(['Designed Left Coxa Bracket']);
  });

  it("reads the tool from Gemini's generated call ids", () => {
    expect(toolIdentity({ toolCallId: 'robotics_cad__get_scene-1792430000000-3', title: 'get_scene' }).toolName).toBe(
      'mcp__robotics_cad__get_scene',
    );
    expect(toolIdentity({ toolCallId: 'write_todos-1792430000000-4' }).toolName).toBe('write_todos');
    expect(toolIdentity({ toolCallId: 'call_abc', title: 'Searching' }).toolName).toBeUndefined();
  });
});
