import { describe, expect, it } from 'vitest';
import { parseSlash } from '../agent/slashCommands';
import type { AgentKind } from '../types/robotics';
import { coachRequest, NEEDS_AI_AGENT, teachRequest } from './teachRequest';

const AI_AGENTS: AgentKind[] = ['claude', 'codex', 'gemini', 'custom'];

describe('where Teach sends its words', () => {
  it('sends the goal to an AI agent as /train, the skill pipeline’s command', () => {
    for (const agent of AI_AGENTS) {
      const request = teachRequest(' drive forward and stop ', agent);

      expect(request).toEqual({ kind: 'agent', text: '/train drive forward and stop' });
      expect(request.kind === 'agent' && parseSlash(request.text)).toEqual({
        command: 'train',
        rest: 'drive forward and stop',
      });
    }
  });

  it('never hands a goal to the offline part tracer', () => {
    expect(teachRequest('drive forward', 'offline')).toEqual({ kind: 'refused', message: NEEDS_AI_AGENT });
    expect(coachRequest('Walk', 'lift its feet', 'offline')).toEqual({ kind: 'refused', message: NEEDS_AI_AGENT });
    expect(NEEDS_AI_AGENT).toMatch(/ in Settings ▸ Agent\.$/);
  });

  it('scopes a Coach to its row', () => {
    expect(coachRequest('Walk', 'lift its feet ', 'claude')).toEqual({
      kind: 'agent',
      text: '/coach Walk: lift its feet',
    });
  });
});
