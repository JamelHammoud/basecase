import { slashText } from '../agent/slashCommands';
import type { AgentKind } from '../types/robotics';

export const NEEDS_AI_AGENT = 'Teaching needs an AI agent. Choose Claude, Codex or Gemini in Settings ▸ Agent.';

export type TeachRequest = { kind: 'agent'; text: string } | { kind: 'refused'; message: string };

const refusedFor = (agent: AgentKind): TeachRequest | null =>
  agent === 'offline' ? { kind: 'refused', message: NEEDS_AI_AGENT } : null;

export function teachRequest(goal: string, agent: AgentKind): TeachRequest {
  return refusedFor(agent) ?? { kind: 'agent', text: `${slashText('train')}${goal.trim()}` };
}

export function coachRequest(skill: string, words: string, agent: AgentKind): TeachRequest {
  return refusedFor(agent) ?? { kind: 'agent', text: `/coach ${skill}: ${words.trim()}` };
}
