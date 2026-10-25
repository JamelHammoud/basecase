import type { AcpChatMessage } from '../types/robotics';
import type { LiveRun } from '../utils/platform/types';
import { applySessionUpdate, isTranscriptUpdate, markLastAgentFailed, markLastAgentStopped } from './acpTranscript';
import type { SessionUpdate } from './acpTranscript';

export interface RunEnd {
  stopReason?: string;
  error?: string;
}

export const STOPPED_REASONS = new Set(['cancelled', 'max_tokens', 'max_turn_requests']);

export const runUpdates = (run: LiveRun): SessionUpdate[] =>
  run.entries.flatMap((entry) => ('update' in entry ? [entry.update as SessionUpdate] : []));

export function endedMessages(messages: AcpChatMessage[], end: RunEnd): AcpChatMessage[] {
  if (end.error) return markLastAgentFailed(end.error)(messages);

  return end.stopReason && STOPPED_REASONS.has(end.stopReason) ? markLastAgentStopped(messages) : messages;
}

function replayEntry(messages: AcpChatMessage[], entry: LiveRun['entries'][number]) {
  if ('messages' in entry) return [...messages, ...entry.messages];

  const update = entry.update as SessionUpdate;

  return isTranscriptUpdate(update) ? applySessionUpdate(messages, update, new Date(entry.at)) : messages;
}

export function restoreRunMessages(saved: AcpChatMessage[], run: LiveRun): AcpChatMessage[] {
  const ids = new Set(run.entries.flatMap((entry) => ('messages' in entry ? entry.messages.map((m) => m.id) : [])));
  const cut = saved.findIndex((m) => ids.has(m.id));
  const restored = run.entries.reduce(replayEntry, cut === -1 ? saved : saved.slice(0, cut));

  return run.busy ? restored : endedMessages(restored, run);
}
