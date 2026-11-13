import React, { createContext, use } from 'react';
import type { ConsoleLayout } from '../cases/console/layout';
import { robotFacts } from '../cases/robotFit';
import { movableWorld } from '../cases/scale';
import type { CaseAction } from '../cases/console/panelKinds';
import { useCameraTiles } from '../components/cameras/useCameraTiles';
import { CaseRunArea } from '../components/caseRun/CaseRunArea';
import { CodeOverlays } from '../components/caseRun/code/CodeOverlays';
import { startDriving } from '../components/simulate/driveWithCamera';
import { ModeHeader } from '../design-system';
import type { PanelContext } from '../components/caseRun/panelContext';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useConsoleSignals } from './useConsoleSignals';

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
      try: attempt.phase === 'idle',
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
  const { caseRun, simTraining, posing, parts, tool, studio } = core;
  const { sim, cases } = simTraining;
  const { open, caseConsole, layout } = caseRun;
  const wantsTiles = caseConsole.panels.some((p) => p.kind === 'camera');
  const wantsStreams = caseConsole.panels.some((p) => p.kind === 'code');
  const cameras = useCameraTiles({
    parts,
    sim,
    cameras: actions.cameras,
    patchPart: actions.edits.patchPart,
    active: () => open && (wantsTiles || wantsStreams),
    tiles: wantsTiles,
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

  const value: CenterValue | null = open
    ? {
        ctx: {
          bus,
          signals: caseConsole.signals ?? [],
          scope: {
            declared: new Set(caseConsole.signals?.map((s) => s.id)),
            probes: new Set(cases.active?.task.probes.map((p) => p.signal)),
            inputs: new Set(caseConsole.input),
          },
          inputs: caseConsole.input,
          brief: cases.active?.brief ?? '',
          world: movableWorld(cases.active, robotFacts(posing.rig, parts)),
          sim,
          parts,
          joints: core.project.joints ?? [],
          fire,
          can,
          studio: {
            cases,
            cameras,
            onBrowseRobots: () => {
              caseRun.leave();
              tool.setLeftTab('robots');
              studio.setIsLeftOpen(true);
            },
          },
        },
        areas: layout,
        title: cases.active?.name ?? '',
        onDone: caseRun.leave,
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
