import { useEffect, useEffectEvent, useRef } from 'react';
import { platformBridge, type LiveRun } from '../utils/platformBridge';
import type { ActorIndex } from './agentActors';
import { contextFromUpdate } from './acpTranscript';
import { splitLaneKey } from './agentLanes';
import { endedMessages, restoreRunMessages, runUpdates, type RunEnd } from './liveRuns';
import type { StudioShared } from './types';
import { saveChat } from './useAgentChat';
import type { AgentCursors } from './useAgentCursors';
import type { AgentLanes } from './useAgentLanes';
import type { SceneVersions } from './useSceneVersions';

interface AdoptedRunsOptions {
  workspaceId: string;
  lanes: AgentLanes;
  actors: ActorIndex;
  cursors: AgentCursors;
  setChatList: StudioShared['setChatList'];
  drain: (id: string) => Promise<void>;
  versions: Pick<SceneVersions, 'finish' | 'finishAll' | 'perform'>;
}

export function useAdoptedRuns({
  workspaceId,
  lanes,
  actors,
  cursors,
  setChatList,
  drain,
  versions,
}: AdoptedRunsOptions) {
  const startedRef = useRef(false);
  const { flagsOf } = lanes;

  const settle = (laneId: string, key: string) => {
    flagsOf(laneId).adopted = null;
    actors.endLane(laneId);
    cursors.clearLane(laneId);
    void versions.perform(async () => {
      await versions.finish(key);
      await platformBridge.forgetAcpRun(key);
    });
  };

  const adoptRun = async (run: LiveRun) => {
    const { laneId } = splitLaneKey(run.key);
    const flags = flagsOf(laneId);

    if (flags.busy) return;

    const claim: { ready: boolean; ended: RunEnd | null } = { ready: false, ended: null };

    flags.adopted = claim;

    const saved = await platformBridge.getChat(run.chatId).catch(() => null);
    const final = claim.ended ? { ...run, busy: false, ...claim.ended } : run;
    const messages = restoreRunMessages(saved?.messages ?? [], final);
    const context = runUpdates(run).map(contextFromUpdate).findLast(Boolean) ?? saved?.context ?? null;

    lanes.adoptLane(laneId, { chatId: run.chatId, messages, acpSessionId: run.sessionId, context }, final.busy);

    if (!final.busy) {
      saveChat(setChatList, { id: run.chatId, messages, sessionId: run.sessionId, context });
      settle(laneId, run.key);

      return;
    }

    for (const update of runUpdates(run)) actors.note(laneId, update);

    claim.ready = true;
  };

  const adoptAll = useEffectEvent(async () => {
    const runs = await platformBridge.liveAcpRuns(workspaceId);

    await Promise.all(runs.map(adoptRun));
    await versions.perform(() => versions.finishAll(runs.filter((run) => run.busy).map((run) => run.key)));
  });

  useEffect(() => {
    if (startedRef.current) return;

    startedRef.current = true;
    void adoptAll();
  }, []);

  const onRunEnd = (laneId: string, end: RunEnd) => {
    const flags = flagsOf(laneId);
    const claim = flags.adopted;

    if (!claim) return;

    if (!claim.ready) {
      claim.ended = end;

      return;
    }

    flags.busy = false;
    lanes.setMessages(laneId, (prev) => endedMessages(prev, end));
    lanes.updateLane(laneId, (l) => ({ ...l, busy: false, status: '' }));
    settle(laneId, lanes.keyOf(laneId));
    void drain(laneId);
  };

  return { onRunEnd };
}
