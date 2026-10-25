import { useState, type SetStateAction } from 'react';
import type { AcpChatMessage } from '../types/robotics';
import type { AcpPromptPayload } from '../utils/platformBridge';
import { useLatestRef } from '../utils/useLatestRef';
import { MAIN_LANE, laneKey, newLane, type AgentLane, type LaneChat } from './agentLanes';
import type { RunEnd } from './liveRuns';
import type { WorkspaceSeed } from './types';

export interface QueuedPrompt {
  messageId: string;
  payload: AcpPromptPayload;
}

export interface LaneFlags {
  busy: boolean;
  follow: boolean;
  queued: QueuedPrompt[];
  pendingResume: string | null;
  adopted: { ready: boolean; ended: RunEnd | null } | null;
}

const newFlags = (pendingResume: string | null = null): LaneFlags => ({
  busy: false,
  follow: true,
  queued: [],
  pendingResume,
  adopted: null,
});

const resolve = <T>(next: SetStateAction<T>, prev: T) =>
  typeof next === 'function' ? (next as (p: T) => T)(prev) : next;

export function useAgentLanes(workspaceId: string, seed?: WorkspaceSeed) {
  'use memo';

  const [lanes, setLanes] = useState<AgentLane[]>(() => [newLane(MAIN_LANE, seed?.chat)]);
  const [currentId, setCurrentId] = useState(MAIN_LANE);
  const [flags] = useState(() => new Map<string, LaneFlags>([[MAIN_LANE, newFlags(seed?.chat?.acpSessionId ?? null)]]));
  const lanesRef = useLatestRef(lanes);
  const current = lanes.find((l) => l.id === currentId) ?? lanes[0];

  const flagsOf = (id: string) => {
    const known = flags.get(id);

    if (known) return known;

    const made = newFlags();

    flags.set(id, made);

    return made;
  };

  const updateLane = (id: string, fn: (lane: AgentLane) => AgentLane) =>
    setLanes((prev) => prev.map((l) => (l.id === id ? fn(l) : l)));

  const setMessages = (id: string, next: SetStateAction<AcpChatMessage[]>) =>
    updateLane(id, (l) => ({ ...l, messages: resolve(next, l.messages) }));

  const addLane = (id: string, chat?: LaneChat) => {
    flags.set(id, newFlags(chat?.acpSessionId ?? null));
    setLanes((prev) => [...prev, newLane(id, chat)]);
  };

  const adoptLane = (id: string, chat: LaneChat, busy: boolean) => {
    const lane = { ...newLane(id, chat), busy };

    flagsOf(id).busy = busy;
    flagsOf(id).pendingResume = null;
    setLanes((prev) => (prev.some((l) => l.id === id) ? prev.map((l) => (l.id === id ? lane : l)) : [...prev, lane]));
  };

  const removeLane = (id: string) => {
    flags.delete(id);
    setLanes((prev) => prev.filter((l) => l.id !== id));
  };

  const selectLane = (id: string) => {
    setCurrentId(id);
    updateLane(id, (l) => ({ ...l, usedAt: Date.now() }));
  };

  const resetLanes = (chat?: LaneChat) => {
    flags.clear();
    flags.set(MAIN_LANE, newFlags(chat?.acpSessionId ?? null));
    setLanes([newLane(MAIN_LANE, chat)]);
    setCurrentId(MAIN_LANE);
  };

  return {
    lanes,
    lanesRef,
    current,
    currentId,
    keyOf: (id: string) => laneKey(workspaceId, id),
    flagsOf,
    isBusy: (id: string) => flags.get(id)?.busy ?? false,
    updateLane,
    setMessages,
    addLane,
    adoptLane,
    removeLane,
    selectLane,
    resetLanes,
  };
}

export type AgentLanes = ReturnType<typeof useAgentLanes>;
