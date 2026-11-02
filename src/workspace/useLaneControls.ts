import { useEffect, useEffectEvent, useRef } from 'react';
import type { ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { chatTitle } from './acpTranscript';
import type { AgentLane } from './agentLanes';
import { recordEdit, revertEdits } from './runEdits';
import type { AgentLanes } from './useAgentLanes';
import type { WorkspaceCore } from './useWorkspaceCore';

interface LaneControlOptions {
  core: WorkspaceCore;
  lanes: AgentLanes;
  active: boolean;
  alive: () => boolean;
  persistLane: (id: string) => void;
}

function useRunFinished({ core, lanes, active, alive, persistLane }: LaneControlOptions) {
  const { workspaceId, studio, scene, showToast, tool } = core;
  const wasBusyRef = useRef(new Set<string>());

  const finished = (lane: AgentLane) => {
    persistLane(lane.id);

    if (!alive()) return;

    if (!active) {
      studio.notify(workspaceId, `Agent finished in ${scene.sceneName}`);

      return;
    }

    if (lane.id === lanes.currentId && tool.rightTab === 'acp') return;

    showToast(`Agent finished “${chatTitle(lane.messages)}”`, {
      tone: 'success',
      action: {
        label: 'Show',
        onClick: () => {
          lanes.selectLane(lane.id);
          tool.setRightTab('acp');
        },
      },
    });
  };

  const onLanes = useEffectEvent((list: AgentLane[]) => {
    const busyNow = new Set(list.filter((l) => l.busy).map((l) => l.id));

    for (const id of wasBusyRef.current) {
      const lane = list.find((l) => l.id === id);

      if (lane && !busyNow.has(id)) finished(lane);
    }

    wasBusyRef.current = busyNow;
  });

  useEffect(() => onLanes(lanes.lanes), [lanes.lanes]);
}

export function useLaneControls(options: LaneControlOptions) {
  const { core, lanes } = options;
  const { showToast, undo } = core;
  const { commitParts } = core.docs;
  const { updateLane, flagsOf, keyOf } = lanes;

  useRunFinished(options);

  const stop = (id = lanes.currentId) => {
    flagsOf(id).stopped = true;
    platformBridge.cancelAcp(keyOf(id)).catch(() => {});
  };

  const revert = () => {
    const { id, edits } = lanes.current;

    if (!Object.keys(edits).length) return;

    commitParts((prev) => revertEdits(prev, edits));
    updateLane(id, (l) => ({ ...l, edits: {} }));
    showToast('Reverted agent changes', { action: { label: 'Undo', onClick: undo } });
  };

  return {
    stop,
    stopAll: () => lanes.lanes.filter((l) => l.busy).forEach((l) => stop(l.id)),
    revert,
    recordEdit: (id: string, partId: string, before: ScenePart | null) =>
      updateLane(id, (l) => ({ ...l, edits: recordEdit(l.edits, partId, before) })),
    stopFollowing: () => lanes.lanes.forEach((l) => (flagsOf(l.id).follow = false)),
    isFollowing: (id: string) => flagsOf(id).follow,
  };
}

export type LaneControls = ReturnType<typeof useLaneControls>;
