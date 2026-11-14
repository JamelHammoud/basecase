import { useRef, useState } from 'react';
import { toCad } from '../agent/agentFrame';
import { placeArm } from '../arm/armBuild';
import { sizeArmInWorker } from '../arm/armSizingClient';
import type { ScenePart } from '../types/robotics';
import { MAX_TARGETS, type ArmTarget } from '../utils/armSizing';
import { errorMessage } from '../utils/errorMessage';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { WorkspaceCore } from './useWorkspaceCore';

export const armTargets = (parts: ScenePart[], ids: readonly string[]): ArmTarget[] =>
  parts
    .filter((p) => ids.includes(p.id) && p.role === 'reference' && p.kind !== 'image_plane')
    .map((p) => ({ id: p.id, name: p.name, at: toCad(p.position) }));

export function useArmSizing(core: WorkspaceCore) {
  'use memo';

  const { docs, parts, selectedIds, setSelectedIds, skeleton, tool } = core;
  const [targets, setTargets] = useState<ArmTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const requestRef = useRef(0);
  const selected = armTargets(parts, selectedIds);

  const close = () => {
    requestRef.current += 1;
    setTargets(null);
    setProblem(null);
    setBusy(false);
  };

  const size = async (payloadG: number) => {
    if (!targets) return;

    const request = ++requestRef.current;

    setBusy(true);

    const result = await sizeArmInWorker({ targets, payloadG }).catch((err: unknown) => ({
      problem: errorMessage(err),
    }));

    if (request !== requestRef.current) return;

    setBusy(false);

    if (!('arm' in result)) {
      setProblem(result.problem);

      return;
    }

    placeArm(result.arm, {
      parts: () => docs.partsRef.current,
      skeleton: () => docs.projectRef.current.skeleton,
      place: docs.commitSkeleton,
      links: !IS_WEB_DEMO,
    });
    setSelectedIds([]);
    close();
    skeleton.setEditing(true);
    tool.setMode('pose');
  };

  return {
    canSize: selected.length > 0 && selected.length <= MAX_TARGETS,
    open: () => {
      requestRef.current += 1;
      setProblem(null);
      setBusy(false);
      setTargets(selected);
    },
    targets,
    busy,
    problem,
    close,
    size: (payloadG: number) => void size(payloadG),
  };
}

export type ArmSizingState = ReturnType<typeof useArmSizing>;
