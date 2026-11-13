import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { consoleLayout, DEFAULT_CONSOLE } from '../cases/console/layout';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ViewShot } from '../three/viewport/types';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { Cases } from './useCases';

interface CommandCenterInput {
  viewportRef: RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  simTraining: { sim: Simulation; cases: Cases };
}

interface Return {
  caseId: string;
  view: ViewShot | null;
  selection: string[];
}

export function useCommandCenter({ viewportRef, selectedIds, setSelectedIds, simTraining }: CommandCenterInput) {
  const { sim, cases } = simTraining;
  const [back, setBack] = useState<Return | null>(null);
  const activeId = cases.active?.id ?? null;
  const open = back !== null && back.caseId === activeId;
  const caseConsole = cases.active?.console ?? DEFAULT_CONSOLE;

  const enter = () => {
    if (open || !cases.active) return;

    setBack({ caseId: cases.active.id, view: viewportRef.current?.currentView() ?? null, selection: selectedIds });
  };

  const restore = (saved: Return) => {
    if (sim.drive.active) sim.drive.stop();

    setBack(null);
    setSelectedIds(saved.selection);

    if (saved.view) viewportRef.current?.lookThrough(saved.view);
  };

  const leave = () => {
    if (open && back) restore(back);
  };

  const stale = back !== null && !open;
  const leaveStale = useEffectEvent(() => {
    if (back) restore(back);
  });

  useEffect(() => {
    if (!stale) return;

    const soon = setTimeout(leaveStale, 0);

    return () => clearTimeout(soon);
  }, [stale]);

  const inputs = open ? caseConsole.input : null;
  const { setInputs } = sim.drive;

  useEffect(() => {
    if (!inputs) return;

    setInputs(inputs);

    return () => setInputs(null);
  }, [inputs, setInputs]);

  const layout = consoleLayout(caseConsole, { desktop: !IS_WEB_DEMO });

  return { open, caseConsole, layout, enter, leave };
}

export type CommandCenter = ReturnType<typeof useCommandCenter>;
