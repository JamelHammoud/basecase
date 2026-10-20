import { useState } from 'react';
import { laneOfActor } from './agentActors';
import type { Vec3 } from './types';

export interface AgentCursorState {
  actor: string;
  name: string;
  target: Vec3 | null;
  action: string;
}

export function useAgentCursors() {
  'use memo';

  const [cursors, setCursors] = useState<AgentCursorState[]>([]);

  const patch = (actor: string, name: string, change: Partial<AgentCursorState>) =>
    setCursors((prev) => {
      const known = prev.find((c) => c.actor === actor);

      if (known) return prev.map((c) => (c.actor === actor ? { ...c, ...change } : c));

      return [...prev, { actor, name, target: null, action: '', ...change }];
    });

  return {
    cursors,
    setCursor: (actor: string, name: string, target: Vec3) => patch(actor, name, { target }),
    setAction: (actor: string, name: string, action: string) => patch(actor, name, { action }),
    clearActor: (actor: string) => setCursors((prev) => prev.filter((c) => c.actor !== actor)),
    clearLane: (laneId: string) => setCursors((prev) => prev.filter((c) => laneOfActor(c.actor) !== laneId)),
  };
}

export type AgentCursors = ReturnType<typeof useAgentCursors>;
