import type { RefObject } from 'react';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import type { TryDraft, TryRecord } from '../cases/tries';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { CaseTry } from './useCaseTry';
import { useCaseMat } from './useCaseMat';
import { useRealReplay } from './useRealReplay';
import { useRealTry } from './useRealTry';
import type { TryTimeline } from './useTryTimeline';

interface RealRobotOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  tries: TryRecord[];
  partners: () => SlotRobot[];
  viewportRef: RefObject<Viewport3DHandle | null>;
  attempt: CaseTry;
  timeline: TryTimeline;
  onTry: (draft: TryDraft) => void;
  onRefuse: (message: string) => void;
}

export function useRealRobotTries(options: RealRobotOptions) {
  const { sim, rig, parts, active, tries, partners, viewportRef, attempt, timeline } = options;
  const mat = useCaseMat({ rig, parts, active, partners });
  const realReplay = useRealReplay({ sim, rig, tries, viewportRef });
  const realTry = useRealTry({
    sim,
    rig,
    parts,
    active,
    blocked: attempt.phase !== 'idle',
    matOf: mat.matOf,
    viewportRef,
    onStart: realReplay.close,
    onTry: options.onTry,
    onRefuse: options.onRefuse,
  });

  const replay = async (record: TryRecord) => {
    if (!record.real) {
      realReplay.close();

      return timeline.show(record);
    }

    timeline.close();
    await realReplay.show(record);
  };

  return { mat, realTry, realReplay, replay };
}
