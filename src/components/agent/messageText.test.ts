import { describe, expect, it } from 'vitest';
import type { AcpChatMessage } from '../../types/robotics';
import { withQuotes } from '../../workspace/agentPrompt';
import { messageQuote } from './messageText';

const message = (fields: Partial<AcpChatMessage>): AcpChatMessage => ({
  id: 'msg-1',
  role: 'agent',
  text: '',
  timestamp: '2026-11-07T00:00:00.000Z',
  ...fields,
});

describe('messageQuote', () => {
  it('quotes an agent reply as plain text, leaving out its tool calls and markers', () => {
    const quote = messageQuote(
      message({
        segments: [
          { type: 'thought', text: 'Thinking' },
          { type: 'tool', toolCallId: 'tool-1' },
          {
            type: 'text',
            text: '## Summary\n\nThe **M3 screw** is in `body_tub`, see [the guide](#build-guide).[MODEL_CREATED:a]',
          },
        ],
      }),
    );

    expect(quote).toEqual({
      id: 'msg-1',
      source: 'your reply',
      text: 'Summary\n\nThe M3 screw is in body_tub, see the guide.',
    });
  });

  it('keeps underscores and single asterisks that are part of the text', () => {
    expect(messageQuote(message({ text: 'Set servo_id to 2*8' }))?.text).toBe('Set servo_id to 2*8');
  });

  it('quotes what a person typed, without the quotes they sent with it', () => {
    const quotes = [{ id: 'q', source: 'Checks', text: 'Too heavy' }];
    const quote = messageQuote(message({ role: 'user', text: ' Is this safe? ', quotes }));

    expect(quote).toEqual({ id: 'msg-1', source: 'my message', text: 'Is this safe?' });
  });

  it('quotes the quote when a message has nothing else', () => {
    const quotes = [{ id: 'q', source: 'Checks', text: 'Too heavy' }];

    expect(messageQuote(message({ role: 'user', quotes }))?.text).toBe('Too heavy');
  });

  it('has nothing to quote in a message without text', () => {
    expect(messageQuote(message({ role: 'user', imageAttachments: ['data:image/png;base64,'] }))).toBeNull();
    expect(messageQuote(message({ segments: [{ type: 'tool', toolCallId: 'tool-1' }] }))).toBeNull();
  });

  it('reaches the agent with a > on every line', () => {
    const quote = messageQuote(message({ text: 'First line\nSecond line' }));

    expect(withQuotes('Why?', quote ? [quote] : [])).toBe(
      'Quoted from your reply:\n> First line\n> Second line\n\nWhy?',
    );
  });
});
