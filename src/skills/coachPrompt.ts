import {
  COACH_SIGNALS,
  isCoachSignal,
  minimumMove,
  signalNumber,
  SIGNAL_SPECS,
  type CoachDirection,
  type CoachSignal,
  type CoachSignals,
} from './coachSignals';

export interface CoachBrief {
  name: string;
  skill: string;
  reward: string;
  signals: CoachSignals;
}

export interface CoachRevision {
  reward: string;
  signal: CoachSignal;
  direction: CoachDirection;
}

export type RevisionRead = { ok: true; revision: CoachRevision } | { ok: false; reason: string };

const MAX_REWARD_CHARS = 8000;
const ENTRY = /^def reward\(state\):/m;
const REFUSED_WORDS = /(?:^\s*(?:import|from)\s)|__|\b(?:while|for|lambda)\b/m;
const FIXED_KEYS = ['contract', 'observation', 'action', 'signals', 'environment', 'horizon', 'reset'];
const KEYS = ['reward', 'signal', 'direction', 'why'];

export const REWARDLANG =
  'RewardLang is a Python subset that Forge parses and never executes: `def` functions only, `reward(state)` returns a sum of term("name", value). ' +
  'state has gravity, z, z0, linvel, angvel, joint_pos, joint_vel, action, last_action, command, control_dt. ' +
  'Allowed: exp, sum, abs, max, min, clamp, sqrt, tanh, square, a if c else b; no imports, loops or lambdas; powers 0 to 8; divide only by a positive value.';

export const COACH_SYSTEM = [
  'You coach a robot skill that already passes its task contract in Arena.',
  'Change how it moves by revising its RewardLang reward. The contract, the observation and the action stay as they are.',
  'Training starts from the skill as it is; the result is kept only if Arena passes the same contract and the signal you name moves the way you say by at least its minimum.',
  'Keep every term that teaches the task, and add or reweight terms for the style asked.',
  REWARDLANG,
  `Answer with one JSON object and nothing else: { "reward": "<the whole revised program>", "signal": one of ${COACH_SIGNALS.join(', ')}, "direction": "up" or "down" }.`,
].join('\n');

const signalLine = (signals: CoachSignals) => (signal: CoachSignal) =>
  `- ${signal}: ${signalNumber(signal, signals[signal])}, ${SIGNAL_SPECS[signal].meaning}; must move at least ${signalNumber(signal, minimumMove(signal, signals[signal]))}`;

export function coachPrompt(brief: CoachBrief, words: string): string {
  return [
    `Skill: ${brief.name}`,
    `The person says: “${words.trim()}”`,
    '',
    'Measured on one clean run:',
    ...COACH_SIGNALS.map(signalLine(brief.signals)),
    '',
    'Current reward:',
    brief.reward.trim(),
  ].join('\n');
}

function jsonIn(text: string): unknown {
  const from = text.indexOf('{');
  const to = text.lastIndexOf('}');

  if (from < 0 || to < from) return null;

  try {
    return JSON.parse(text.slice(from, to + 1));
  } catch {
    return null;
  }
}

function rewardProblem(reward: unknown, before: string): string | null {
  if (typeof reward !== 'string' || !reward.trim()) return 'The answer has no reward.';

  if (reward.length > MAX_REWARD_CHARS) return `The reward is over ${MAX_REWARD_CHARS} characters.`;

  if (!ENTRY.test(reward) || REFUSED_WORDS.test(reward))
    return 'The reward doesn’t parse as RewardLang: it needs def reward(state): and no imports, loops, lambdas or __ names.';

  return reward.trim() === before.trim() ? 'The reward is the same as before, so there is nothing to train.' : null;
}

function shapeProblem(answer: Record<string, unknown>): string | null {
  const fixed = FIXED_KEYS.filter((k) => k in answer);

  if (fixed.length)
    return `The coach changes only the reward, and this answer also changes the ${fixed.join(' and ')}. Arena judges the skill on its own contract, observation and action.`;

  const extra = Object.keys(answer).filter((k) => !KEYS.includes(k));

  return extra.length ? `The answer has fields the coach doesn’t take: ${extra.join(', ')}.` : null;
}

export function readRevision(text: string, before: string): RevisionRead {
  const answer = jsonIn(text);

  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    return { ok: false, reason: 'The answer isn’t one JSON object.' };

  const fields = answer as Record<string, unknown>;
  const problem = shapeProblem(fields) ?? rewardProblem(fields.reward, before);

  if (problem) return { ok: false, reason: problem };

  if (!isCoachSignal(fields.signal)) return { ok: false, reason: `The signal is one of ${COACH_SIGNALS.join(', ')}.` };

  if (fields.direction !== 'up' && fields.direction !== 'down')
    return { ok: false, reason: 'The direction is up or down.' };

  return {
    ok: true,
    revision: { reward: (fields.reward as string).trim(), signal: fields.signal, direction: fields.direction },
  };
}
