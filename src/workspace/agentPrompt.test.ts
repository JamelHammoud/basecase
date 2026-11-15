import { describe, expect, it } from 'vitest';
import type { MessageQuote } from '../types/robotics';
import { buildAgentPrompt, joinNotes, resendPayload, runningCaseNote, withQuotes } from './agentPrompt';

const quote: MessageQuote = {
  id: 'print:wall',
  source: 'Checks',
  text: 'Too thin to print.',
  parts: 'Body Tub',
  context: 'Parts: a\nDetail: walls under 0.84 mm',
};
const now = new Date('2026-01-01T00:00:00Z');

describe('messages about a running Case', () => {
  it('sends the Case name, id and code-editing instruction alongside other notes without changing the chat text', () => {
    const note = joinNotes('Marks: Body Tub', runningCaseNote({ id: 'rover-remote', name: 'Rover Remote' }));
    const { payload, userMessage } = buildAgentPrompt({ text: 'Add a Sit button', note }, now);

    expect(payload.promptText).toContain('Add a Sit button\n\nMarks: Body Tub\n\n');
    expect(payload.promptText).toContain('running the Case Rover Remote (rover-remote)');
    expect(payload.promptText).toContain('change its app with write_case_code');
    expect(payload.promptText).toContain('leave the design alone unless the words ask');
    expect(userMessage.text).toBe('Add a Sit button');
  });

  it('uses the current Case on retry without retaining the earlier Case', () => {
    const first = buildAgentPrompt(
      { text: 'Add a Sit button', note: runningCaseNote({ id: 'rover-remote', name: 'Rover Remote' }) },
      now,
    );
    const payload = resendPayload(first.userMessage, {
      note: runningCaseNote({ id: 'arm-remote', name: 'Arm Remote' }),
    });

    expect(payload.promptText).toContain('Add a Sit button');
    expect(payload.promptText).toContain('running the Case Arm Remote (arm-remote)');
    expect(payload.promptText).not.toContain('Rover Remote');
    expect(payload.promptText).not.toContain('rover-remote');
  });

  it('sends plain messages and retries without Case instructions when there is no running Case', () => {
    const note = joinNotes(runningCaseNote(null));
    const { payload, userMessage } = buildAgentPrompt({ text: 'Add a Sit button', note }, now);

    expect(payload.promptText).toBe('Add a Sit button');
    expect(resendPayload(userMessage, { note }).promptText).toBe('Add a Sit button');
  });
});

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
