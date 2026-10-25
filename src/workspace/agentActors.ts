import type { SessionUpdate } from './acpTranscript';

const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);
const DONE = new Set(['completed', 'failed']);

interface Subagent {
  laneId: string;
  name: string;
  done: boolean;
}

interface UpdateMeta {
  claudeCode?: { toolName?: string; parentToolUseId?: string };
}

export const isSubagentTool = (toolName: string | undefined) => !!toolName && SUBAGENT_TOOLS.has(toolName);

export const parentToolUseIdOf = (u: SessionUpdate) => (u._meta as UpdateMeta | undefined)?.claudeCode?.parentToolUseId;

const subagentActor = (laneId: string, callId: string) => `${laneId}/${callId}`;

export const laneOfActor = (actor: string) => actor.split('/')[0];

const related = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

const describeOf = (u: SessionUpdate) => {
  const input = u.rawInput as { description?: unknown } | undefined;

  return typeof input?.description === 'string' ? input.description : '';
};

export class ActorIndex {
  private parents = new Map<string, string>();
  private subagents = new Map<string, Subagent>();
  private claims = new Map<string, string>();

  note(laneId: string, u: SessionUpdate): string | null {
    if (u.sessionUpdate !== 'tool_call' && u.sessionUpdate !== 'tool_call_update') return null;

    const id = String(u.toolCallId);
    const parent = parentToolUseIdOf(u);

    if (parent) {
      this.parents.set(id, parent);

      return null;
    }

    return this.noteSubagent(laneId, id, u);
  }

  private noteSubagent(laneId: string, id: string, u: SessionUpdate) {
    const known = this.subagents.get(id);

    if (!known && !isSubagentTool((u._meta as UpdateMeta | undefined)?.claudeCode?.toolName)) return null;

    const done = DONE.has(String(u.status));
    const name = describeOf(u) || known?.name || 'Subagent';

    this.subagents.set(id, { laneId, name, done: done || !!known?.done });

    return done && !known?.done ? subagentActor(laneId, id) : null;
  }

  actorOf(laneId: string, toolUseId?: string) {
    const parent = toolUseId ? this.parents.get(toolUseId) : undefined;

    return parent && this.subagents.has(parent) ? subagentActor(laneId, parent) : laneId;
  }

  nameOf(actor: string, leadName = 'Agent') {
    const [, callId] = actor.split('/');

    return callId ? (this.subagents.get(callId)?.name ?? 'Subagent') : leadName;
  }

  isActive(actor: string, laneBusy: (laneId: string) => boolean) {
    const [laneId, callId] = actor.split('/');

    if (!laneBusy(laneId)) return false;

    return !callId || this.subagents.get(callId)?.done === false;
  }

  holderOf(partId: string, actor: string, laneBusy: (laneId: string) => boolean) {
    const holder = this.claims.get(partId);

    if (!holder || related(holder, actor) || !this.isActive(holder, laneBusy)) return null;

    return holder;
  }

  claim(partId: string, actor: string) {
    this.claims.set(partId, actor);
  }

  endLane(laneId: string) {
    for (const [partId, actor] of this.claims) if (laneOfActor(actor) === laneId) this.claims.delete(partId);

    for (const sub of this.subagents.values()) if (sub.laneId === laneId) sub.done = true;
  }
}

export function conflictText(partId: string, holder: string, index: ActorIndex) {
  const owner = holder.includes('/')
    ? `the “${index.nameOf(holder)}” part designer is working on it`
    : 'another chat in this scene is working on it';

  return `${partId} not changed: ${owner}. Leave it, and mention it in your report`;
}
