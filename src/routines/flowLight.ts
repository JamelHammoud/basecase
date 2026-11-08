import type { Flow, NodeState } from './flowTypes';
import type { TraceEvent } from './scenarioTypes';

export interface Lighting {
  states: Record<string, NodeState>;
  rejected: TraceEvent[];
}

const OP_STATE: Record<string, NodeState> = {
  opStart: 'active',
  opDone: 'done',
  opFail: 'failed',
  opTimeout: 'timedOut',
  opCancel: 'cancelled',
};

const REACTION_STATE: Record<string, NodeState> = { fired: 'active', ended: 'done' };

function stateFor(event: TraceEvent): NodeState | null {
  if (event.node !== undefined && OP_STATE[event.kind]) return OP_STATE[event.kind];

  if (event.node !== undefined && event.kind === 'branch') return event.taken ? 'then' : 'else';

  if (event.reaction !== undefined) return REACTION_STATE[event.kind] ?? null;

  return null;
}

export function lightFlow(flow: Flow, events: TraceEvent[]): Lighting {
  const states: Record<string, NodeState> = Object.fromEntries(
    flow.nodes.filter((n) => n.kind !== 'end').map((n) => [n.id, 'idle' as NodeState]),
  );
  const rejected: TraceEvent[] = [];

  for (const event of events) {
    const target = event.node ?? event.reaction;

    if (target === undefined) continue;

    if (!Object.hasOwn(states, target)) {
      rejected.push(event);

      continue;
    }

    const next = stateFor(event);

    if (next) states[target] = next;
  }

  return { states, rejected };
}
