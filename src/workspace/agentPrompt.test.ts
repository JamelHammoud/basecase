import { describe, expect, it } from 'vitest';
import type { MessageQuote } from '../types/robotics';
import { buildAgentPrompt, resendPayload, withQuotes } from './agentPrompt';

const quote: MessageQuote = {
  id: 'print:wall',
  source: 'Checks',
  text: 'Too thin to print.',
  parts: 'Body Tub',
  context: 'Parts: a\nDetail: walls under 0.84 mm',
};
const now = new Date('2026-01-01T00:00:00Z');

describe('quotes in a message', () => {
  it('reach the agent ahead of what the person typed, with the detail they never see', () => {
    const { payload } = buildAgentPrompt({ text: 'Is this safe to ignore?', quotes: [quote] }, now);

    expect(payload.promptText).toBe(
      [
        'Quoted from Checks:',
        '> Too thin to print.',
        '> Parts: a',
        '> Detail: walls under 0.84 mm',
        '',
        'Is this safe to ignore?',
      ].join('\n'),
    );
  });

  it('stay out of the typed text in the chat', () => {
    const { userMessage } = buildAgentPrompt({ text: 'Why?', quotes: [quote] }, now);

    expect(userMessage.text).toBe('Why?');
    expect(userMessage.quotes).toEqual([quote]);
  });

  it('send on their own', () => {
    expect(withQuotes('', [quote])).toMatch(/^Quoted from Checks:/);
    expect(withQuotes('', [quote])).not.toMatch(/\n\n$/);
  });

  it('come along on a retry', () => {
    const { userMessage } = buildAgentPrompt({ text: 'Why?', quotes: [quote] }, now);

    expect(resendPayload(userMessage, {}).promptText).toContain('> Too thin to print.');
  });

  it('leave a plain message alone', () => {
    const { payload, userMessage } = buildAgentPrompt({ text: 'Hello', quotes: [] }, now);

    expect(payload.promptText).toBe('Hello');
    expect(userMessage.quotes).toBeUndefined();
  });
});
