import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { consoleLayout, DEFAULT_CONSOLE } from '../cases/console/layout';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ViewShot } from '../three/viewport/types';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { setVoiceWords } from '../voice/voiceSession';
import { voiceWordsOf } from '../voice/voiceWords';
import type { Cases } from './useCases';

interface CaseRunInput {
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

export function useCaseRun({ viewportRef, selectedIds, setSelectedIds, simTraining }: CaseRunInput) {
  const { sim, cases } = simTraining;
  const [back, setBack] = useState<Return | null>(null);
  const activeId = cases.active?.id ?? null;
  const open = back !== null && back.caseId === activeId;
  const caseConsole = cases.active?.console ?? DEFAULT_CONSOLE;

  const enterCase = (caseId: string) => {
    const fresh = { caseId, view: viewportRef.current?.currentView() ?? null, selection: selectedIds };

    setBack((saved) => (saved ? { ...saved, caseId } : fresh));
  };

  const enter = () => {
    if (open || !cases.active) return;

    enterCase(cases.active.id);
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

  const logic = open ? cases.active?.logic : undefined;

  useEffect(() => {
    if (!logic) return;

    setVoiceWords(voiceWordsOf(logic));

    return () => setVoiceWords([]);
  }, [logic]);

  const layout = consoleLayout(caseConsole, { desktop: !IS_WEB_DEMO, studio: true });

  return { open, caseConsole, layout, enter, enterCase, leave };
}

export type CaseRun = ReturnType<typeof useCaseRun>;
