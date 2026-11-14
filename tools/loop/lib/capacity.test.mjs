import { describe, expect, it } from 'vitest';
import { capacityHold, sessionCount } from './capacity.mjs';

describe('fitting the loop to the Mac', () => {
  it('counts both providers during fallback and holds new work at their combined limit', () => {
    const listed = [
      '/usr/local/bin/claude -p Build this step',
      'claude --print --output-format json',
      ...Array.from({ length: 5 }, () => 'codex --search exec --model gpt-6.1-sol --ephemeral -'),
      '/usr/local/bin/codex exec --model gpt-6.1-sol -',
    ].join('\n');
    const sessions = sessionCount(listed);

    expect(sessions).toBe(8);
    expect(capacityHold({ lane: 'build', sessions, loadPerCore: 1 })).toBe('8 agent sessions are running');
    expect(capacityHold({ lane: 'review', sessions, loadPerCore: 1 })).toBeNull();
  });

  it('ignores desktop hosts, helper processes and commands that only mention a session', () => {
    const listed = [
      '/usr/local/bin/codex app-server',
      'codex --version',
      'codex',
      'codex exec-server',
      '/usr/local/bin/codex-code-mode-host',
      '/usr/local/bin/claude --output-format stream-json --input-format stream-json',
      '/bin/zsh -c codex --search exec --model gpt-6.1-sol',
      '/bin/zsh -c /usr/local/bin/claude -p Build this step',
    ].join('\n');

    expect(sessionCount(listed)).toBe(0);
  });

  it('holds lanes that open new work first, and keeps room for the lanes that drain the queue', () => {
    expect(capacityHold({ lane: 'build', sessions: 8, loadPerCore: 1 })).toBe('8 agent sessions are running');
    expect(capacityHold({ lane: 'review', sessions: 8, loadPerCore: 1 })).toBeNull();
    expect(capacityHold({ lane: 'revise', sessions: 14, loadPerCore: 1 })).toBe('14 agent sessions are running');
  });

  it('holds lanes that open new work on load per core too, but never the lanes that drain the queue', () => {
    expect(capacityHold({ lane: 'harness', sessions: 2, loadPerCore: 4.6 })).toBe('the Mac is at 4.6× its cores');
    expect(capacityHold({ lane: 'rebase', sessions: 2, loadPerCore: 6 })).toBeNull();
  });
});
