import { LANE_SEPARATOR } from './constants.mjs';

const ofWorkspace = (key, workspaceId) => key === workspaceId || key.startsWith(workspaceId + LANE_SEPARATOR);

export class LiveRuns {
  constructor() {
    this.runs = new Map();
  }

  start(key, { sessionId, run }) {
    if (!run?.chatId) {
      this.runs.delete(key);

      return;
    }

    this.runs.set(key, {
      key,
      sessionId,
      chatId: run.chatId,
      busy: true,
      entries: [{ messages: run.messages ?? [], at: new Date().toISOString() }],
    });
  }

  note(key, update) {
    const run = key && this.runs.get(key);

    if (run?.busy) run.entries.push({ update, at: new Date().toISOString() });
  }

  steer(key, messages) {
    const run = this.runs.get(key);

    if (run?.busy && messages?.length) run.entries.push({ messages, at: new Date().toISOString() });
  }

  finish(key, { stopReason, error }) {
    const run = this.runs.get(key);

    if (!run) return;

    run.busy = false;
    run.stopReason = stopReason;
    run.error = error;
  }

  forget(key) {
    this.runs.delete(key);
  }

  ofWorkspace(workspaceId) {
    return [...this.runs.values()].filter((run) => ofWorkspace(run.key, workspaceId));
  }

  clear() {
    this.runs.clear();
  }
}

export const isLaneOf = ofWorkspace;
