import { useState } from 'react';
import { laneOfActor } from './agentActors';
import type { Vec3 } from './types';

export interface AgentCursorState {
  actor: string;
  name: string;
  target: Vec3 | null;
  action: string;
  parts: string[];
}

export function useAgentCursors() {
  'use memo';

  const [cursors, setCursors] = useState<AgentCursorState[]>([]);

  const patch = (actor: string, name: string, change: Partial<AgentCursorState>) =>
    setCursors((prev) => {
      const known = prev.find((c) => c.actor === actor);

      if (known) return prev.map((c) => (c.actor === actor ? { ...c, ...change } : c));

      return [...prev, { actor, name, target: null, action: '', parts: [], ...change }];
    });

  const claim = (actor: string, name: string, partId: string) =>
    setCursors((prev) => {
      const released = prev.map((c) =>
        c.actor !== actor && c.parts.includes(partId) ? { ...c, parts: c.parts.filter((id) => id !== partId) } : c,
      );
      const known = released.find((c) => c.actor === actor);

      if (known?.parts.includes(partId)) return released;

      if (known) return released.map((c) => (c.actor === actor ? { ...c, parts: [...c.parts, partId] } : c));

      return [...released, { actor, name, target: null, action: '', parts: [partId] }];
    });

  return {
    cursors,
    setCursor: (actor: string, name: string, target: Vec3) => patch(actor, name, { target }),
    setAction: (actor: string, name: string, action: string) => patch(actor, name, { action }),
    claim,
    clearActor: (actor: string) => setCursors((prev) => prev.filter((c) => c.actor !== actor)),
    clearLane: (laneId: string) => setCursors((prev) => prev.filter((c) => laneOfActor(c.actor) !== laneId)),
  };
}

export type AgentCursors = ReturnType<typeof useAgentCursors>;
