import { describe, expect, it } from 'vitest';
import type { AcpChatMessage } from '../types/robotics';
import type { LiveRun } from '../utils/platform/types';
import { restoreRunMessages } from './liveRuns';

const AT = '2026-10-24T12:00:00.000Z';

const msg = (id: string, role: AcpChatMessage['role'], text = ''): AcpChatMessage => ({
  id,
  role,
  text,
  timestamp: AT,
  toolCalls: [],
});

const chunk = (text: string) => ({ update: { sessionUpdate: 'agent_message_chunk', content: { text } }, at: AT });

const run = (patch: Partial<LiveRun>): LiveRun => ({
  key: 'main',
  sessionId: 's1',
  chatId: 'chat-1',
  busy: true,
  entries: [
    { messages: [msg('u2', 'user', 'Longer legs'), msg('a2', 'agent')], at: AT },
    chunk('Making '),
    chunk('them'),
  ],
  ...patch,
});

describe('restoreRunMessages', () => {
  const earlier = [msg('u1', 'user', 'Desk lamp arm'), msg('a1', 'agent', 'Built it.')];

  it('rebuilds a running reply after the saved chat', () => {
    const restored = restoreRunMessages(earlier, run({}));

    expect(restored.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(restored[3].text).toBe('Making them');
  });

  it('replaces a partial save of the same run instead of repeating it', () => {
    const saved = [...earlier, msg('u2', 'user', 'Longer legs'), msg('a2', 'agent', 'Making ')];
    const restored = restoreRunMessages(saved, run({}));

    expect(restored.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(restored[3].text).toBe('Making them');
  });

  it('keeps steered messages in order and marks how a finished run ended', () => {
    const steered = run({
      busy: false,
      error: 'The agent stopped responding.',
      entries: [
        ...run({}).entries,
        { messages: [msg('u3', 'user', 'Thinner'), msg('a3', 'agent')], at: AT },
        chunk('Ok'),
      ],
    });
    const restored = restoreRunMessages(earlier, steered);

    expect(restored.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'a3']);
    expect(restored[5]).toMatchObject({ text: 'Ok', failed: 'The agent stopped responding.' });
  });
});
