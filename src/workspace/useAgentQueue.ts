import { moveItem } from '../utils/moveItem';
import type { QueuedPrompt } from './agentLanes';
import type { AgentSendParams } from './agentPrompt';
import type { SendMode } from './useAgentRun';
import type { AgentLanes } from './useAgentLanes';

export interface QueueSlot {
  laneId: string;
  index: number;
  item: QueuedPrompt;
}

interface AgentQueueOptions {
  lanes: AgentLanes;
  send: (params: AgentSendParams, mode?: SendMode) => Promise<void>;
}

export function useAgentQueue({ lanes, send }: AgentQueueOptions) {
  'use memo';

  const { setQueue, flagsOf } = lanes;
  const laneId = lanes.currentId;

  const take = (itemId: string): QueueSlot | null => {
    const queue = flagsOf(laneId).queued;
    const index = queue.findIndex((q) => q.id === itemId);

    if (index === -1) return null;

    setQueue(laneId, (prev) => prev.filter((q) => q.id !== itemId));

    return { laneId, index, item: queue[index] };
  };

  const put = (slot: QueueSlot, params: AgentSendParams) =>
    setQueue(slot.laneId, (prev) => [
      ...prev.slice(0, slot.index),
      { ...slot.item, params },
      ...prev.slice(slot.index),
    ]);

  const sendNow = async (itemId: string) => {
    const slot = take(itemId);

    if (slot) await send(slot.item.params, 'now');
  };

  return {
    items: lanes.current.queue,
    move: (from: number, to: number) => setQueue(laneId, (prev) => moveItem(prev, from, to)),
    remove: (itemId: string) => setQueue(laneId, (prev) => prev.filter((q) => q.id !== itemId)),
    take,
    put,
    sendNow,
  };
}

export type AgentQueue = ReturnType<typeof useAgentQueue>;
