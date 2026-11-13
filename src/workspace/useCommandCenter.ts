import { useState, type RefObject } from 'react';
import { commandCenterLayout } from '../cases/console';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ViewShot } from '../three/viewport/types';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { StudioShared } from './types';
import type { Cases } from './useCases';

interface CommandCenterInput {
  viewportRef: RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  studio: Pick<StudioShared, 'isLeftOpen' | 'setIsLeftOpen' | 'isRightOpen' | 'setIsRightOpen'>;
  simTraining: { sim: Simulation; cases: Cases };
}

interface Return {
  view: ViewShot | null;
  selection: string[];
  left: boolean;
  right: boolean;
}

export function useCommandCenter({
  viewportRef,
  selectedIds,
  setSelectedIds,
  studio,
  simTraining,
}: CommandCenterInput) {
  const { sim, cases } = simTraining;
  const [back, setBack] = useState<Return | null>(null);
  const open = back !== null && cases.active !== null;

  const enter = () => {
    if (open || !cases.active) return;

    setBack({
      view: viewportRef.current?.currentView() ?? null,
      selection: selectedIds,
      left: studio.isLeftOpen,
      right: studio.isRightOpen,
    });
    studio.setIsLeftOpen(true);
    studio.setIsRightOpen(true);
  };

  const leave = () => {
    if (!back) return;

    if (sim.drive.active) sim.drive.stop();

    setBack(null);
    studio.setIsLeftOpen(back.left);
    studio.setIsRightOpen(back.right);
    setSelectedIds(back.selection);

    if (back.view) viewportRef.current?.lookThrough(back.view);
  };

  const layout = commandCenterLayout(cases.active?.console, { desktop: !IS_WEB_DEMO });

  return { open, layout, enter, leave };
}

export type CommandCenter = ReturnType<typeof useCommandCenter>;
