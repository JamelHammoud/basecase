import React, { createContext, use, useEffect, useEffectEvent } from 'react';
import { consoleScope } from '../cases/console/format';
import type { ConsoleLayout } from '../cases/console/layout';
import { gestureActions, type CaseAction } from '../cases/console/panelKinds';
import { GESTURE_EVENT } from '../cases/gestures';
import { robotFacts } from '../cases/robotFit';
import { movableWorld } from '../cases/scale';
import { onInputEvent } from '../sim/inputEvents';
import { useCameraTiles } from '../components/cameras/useCameraTiles';
import { CaseRunArea } from '../components/caseRun/CaseRunArea';
import { CodeOverlays } from '../components/caseRun/code/CodeOverlays';
import { startDriving } from '../components/simulate/driveWithCamera';
import { ModeHeader } from '../design-system';
import type { PanelContext } from '../components/caseRun/panelContext';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useConsolePlayback } from './useConsolePlayback';
import { useConsoleSignals } from './useConsoleSignals';
import { showPartsSection } from './showView';

interface CenterValue {
  ctx: PanelContext;
  areas: ConsoleLayout;
  title: string;
  onDone: () => void;
}

const CaseRunContext = createContext<CenterValue | null>(null);

function useActions(core: WorkspaceCore) {
  const { sim, cases } = core.simTraining;
  const { attempt } = cases;
  const driving = sim.drive.active;

  const can = (action: CaseAction) =>
    ({
      try: attempt.phase === 'idle' && cases.realTry.phase === 'idle',
      'end-try': attempt.phase === 'running',
      drive: !driving,
      stop: driving,
      'start-over': driving,
      reset: sim.status !== 'off' && attempt.phase === 'idle',
    })[action];

  return { can, run: { attempt, sim } };
}

interface ProviderProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

export function CaseRunProvider({ core, actions, children }: ProviderProps) {
  const { caseRun, simTraining, posing, parts } = core;
  const { sim, cases } = simTraining;
  const { open, caseConsole, layout } = caseRun;
  const wantsCameras = caseConsole.panels.some((p) => p.kind === 'camera');
  const cameras = useCameraTiles({
    parts,
    sim,
    cameras: actions.cameras,
    patchPart: actions.edits.patchPart,
    active: () => open && wantsCameras,
  });
  const bus = useConsoleSignals({
    open,
    kase: cases.active,
    caseConsole,
    sim,
    running: cases.attempt.phase === 'running',
    rig: posing.rig,
    parts,
    cameras: cameras.views.map((v) => v.key),
  });
  const seek = useConsolePlayback({
    open,
    bus,
    timeline: cases.timeline,
    kase: cases.active,
    caseConsole,
    sim,
    rig: posing.rig,
    parts,
    cameras: cameras.views.map((v) => v.key),
  });
  const { can, run } = useActions(core);

  const fire = (action: CaseAction) => {
    if (!can(action)) return;

    if (action === 'try') void run.attempt.start();
    else if (action === 'end-try') run.attempt.end();
    else if (action === 'drive') void startDriving(run.sim.drive, core.showToast);
    else if (action === 'stop') run.sim.drive.stop();
    else if (action === 'start-over') run.sim.drive.respawn();
    else {
      run.sim.reset();
      bus.reset();
    }
  };

  const pressed = useEffectEvent((gesture: string) => gestureActions(caseConsole.panels, gesture).forEach(fire));

  useEffect(() => {
    if (!open) return;

    return onInputEvent(({ name, value }) => {
      if (name === GESTURE_EVENT) pressed(String(value));
    });
  }, [open]);

  const value: CenterValue | null = open
    ? {
        ctx: {
          bus,
          signals: caseConsole.signals ?? [],
          scope: consoleScope(caseConsole, cases.active),
          inputs: caseConsole.input,
          brief: cases.active?.brief ?? '',
          world: movableWorld(cases.active, robotFacts(posing.rig, parts)),
          sim,
          parts,
          joints: core.project.joints ?? [],
          fire,
          can,
          seek,
          studio: {
            cases,
            cameras,
            onShowRobots: () => {
              caseRun.leave();
              showPartsSection(core, 'Robots');
            },
          },
        },
        areas: layout,
        title: cases.active?.name ?? '',
        onDone: cases.timeline.open ? cases.timeline.close : caseRun.leave,
      }
    : null;

  return (
    <CaseRunContext value={value}>
      {children}
      {open && cameras.menu}
    </CaseRunContext>
  );
}

export function CaseRunAreas({ side }: { side: 'before' | 'after' }) {
  const running = use(CaseRunContext);

  if (!running) return null;

  return running.areas[side].map((area) => (
    <CaseRunArea
      key={area.key}
      area={area}
      side={side}
      ctx={running.ctx}
      header={<ModeHeader title={running.title} onDone={running.onDone} />}
    />
  ));
}

export function CaseRunOverlays() {
  const running = use(CaseRunContext);

  if (!running?.areas.overlays.length) return null;

  return <CodeOverlays overlays={running.areas.overlays} ctx={running.ctx} />;
}
