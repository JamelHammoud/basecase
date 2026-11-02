import { describe, expect, it } from 'vitest';
import { applySessionUpdate } from './acpTranscript';

const NOW = new Date('2026-01-02T03:04:05.000Z');

describe('failed tool calls', () => {
  it('keep the reason the agent saw, without fences or error codes', () => {
    let messages = applySessionUpdate([], { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'model_part' }, NOW);

    messages = applySessionUpdate(
      messages,
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 't1',
        status: 'failed',
        content: [
          {
            type: 'content',
            content: {
              type: 'text',
              text: '```\nMCP error -32602: Too big: expected string to have <=400 characters at note\n```',
            },
          },
        ],
      },
      NOW,
    );

    const [call] = messages[0].toolCalls ?? [];

    expect(call.status).toBe('failed');
    expect(call.error).toBe('Too big: expected string to have <=400 characters at note');
  });

  it('keep the reason on a subagent step', () => {
    const parent = { _meta: { claudeCode: { parentToolUseId: 'agent-1' } } };
    let messages = applySessionUpdate([], { sessionUpdate: 'tool_call', toolCallId: 'agent-1', title: 'Agent' }, NOW);

    messages = applySessionUpdate(messages, { ...parent, sessionUpdate: 'tool_call', toolCallId: 's1' }, NOW);
    messages = applySessionUpdate(
      messages,
      {
        ...parent,
        sessionUpdate: 'tool_call_update',
        toolCallId: 's1',
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'openscad compile failed for head-face' } }],
      },
      NOW,
    );

    expect(messages[0].toolCalls?.[0].children?.[0].error).toBe('openscad compile failed for head-face');
  });
});
