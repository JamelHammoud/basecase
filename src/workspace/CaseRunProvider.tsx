import React, { createContext, use, useEffect, useEffectEvent } from 'react';
import { consoleScope } from '../cases/console/format';
import type { SignalScope } from '../cases/console/signalNames';
import { frameAtTime } from '../cases/console/recordedSignals';
import type { ConsoleLayout } from '../cases/console/layout';
import { gestureActions, type CaseAction } from '../cases/console/panelKinds';
import { GESTURE_EVENT } from '../cases/gestures';
import { robotFacts } from '../cases/robotFit';
import { movableWorld } from '../cases/scale';
import { onInputEvent } from '../sim/inputEvents';
import { useCameraTiles } from '../components/cameras/useCameraTiles';
import { AddPanelSheet } from '../components/caseRun/AddPanelSheet';
import { CaseRunArea } from '../components/caseRun/CaseRunArea';
import type { ConsoleEditor } from '../components/caseRun/consoleEditor';
import { CanvasEdge, DragChip } from '../components/caseRun/DragChip';
import { usePanelDrag } from '../components/caseRun/usePanelDrag';
import { CodeOverlays } from '../components/caseRun/code/CodeOverlays';
import { startDriving } from '../components/simulate/driveWithCamera';
import { ModeHeader } from '../design-system';
import type { PanelContext } from '../components/caseRun/panelContext';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useConsoleEditor, type ConsoleEdits } from './useConsoleEditor';
import { useConsoleSignals } from './useConsoleSignals';
import { useRecordedSignals } from './useRecordedSignals';
import { showPartsSection } from './showView';

interface CenterValue {
  ctx: PanelContext;
  editor: ConsoleEditor | null;
  canvasAt: number;
  areas: ConsoleLayout;
  title: string;
  onDone: () => void;
}

const CaseRunContext = createContext<CenterValue | null>(null);

const consoleTitle = (kase: { name: string } | null, record: { robot: string } | null | undefined) =>
  kase?.name ?? record?.robot ?? '';

function useActions(core: WorkspaceCore) {
  const { sim, cases } = core.simTraining;
  const { attempt } = cases;
  const driving = sim.drive.active;

  const can = (action: CaseAction) =>
    !core.caseRun.playback &&
    {
      try: attempt.phase === 'idle' && cases.realTry.phase === 'idle',
      'end-try': attempt.phase === 'running',
      drive: !driving,
      stop: driving,
      'start-over': driving,
      reset: sim.status !== 'off' && attempt.phase === 'idle',
    }[action];

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
  const { open, caseConsole, layout, kase } = caseRun;
  const { timeline } = cases;
  const wantsCameras = caseConsole.panels.some((p) => p.kind === 'camera');
  const cameras = useCameraTiles({
    parts,
    sim,
    cameras: actions.cameras,
    patchPart: actions.edits.patchPart,
    active: () => open && wantsCameras,
  });
  const live = useConsoleSignals({
    open: caseRun.live && !caseRun.playback,
    kase: cases.active,
    caseConsole,
    sim,
    running: cases.attempt.phase === 'running',
    rig: posing.rig,
    parts,
    cameras: cameras.views.map((v) => v.key),
  });
  const recorded = useRecordedSignals({
    timeline,
    model: sim.model,
    rig: posing.rig,
    caseConsole,
    cameras: cameras.views.map((v) => v.key),
  });
  const bus = recorded ?? live;
  const { can, run } = useActions(core);
  const edits = useConsoleEditor(core);
  const { drag, start, chipRef } = usePanelDrag(caseConsole, edits.move);
  const scope = consoleScope(caseConsole, kase);

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
          scope,
          inputs: caseConsole.input,
          brief: kase?.brief ?? '',
          world: movableWorld(kase, robotFacts(posing.rig, parts)),
          sim,
          parts,
          joints: core.project.joints ?? [],
          fire,
          can,
          seek: recorded ? (time) => timeline.seek(frameAtTime(recorded.track, time)) : undefined,
          studio: {
            cases,
            cameras,
            onShowRobots: () => {
              caseRun.leave();
              showPartsSection(core, 'Robots');
            },
          },
        },
        editor: caseRun.editing ? { ...edits, drag, startDrag: start } : null,
        canvasAt: caseConsole.layout.areas.findIndex((a) => 'canvas' in a),
        areas: layout,
        title: consoleTitle(kase, timeline.record),
        onDone: caseRun.done,
      }
    : null;

  return (
    <CaseRunContext value={value}>
      {children}
      {open && cameras.menu}
      {caseRun.editing && <DragChip chipRef={chipRef} drag={drag} />}
      <AddPanel core={core} scope={scope} cameras={cameras.views.map((v) => v.key)} add={edits.add} />
    </CaseRunContext>
  );
}

interface AddPanelProps {
  core: WorkspaceCore;
  scope: SignalScope;
  cameras: string[];
  add: ConsoleEdits['add'];
}

function AddPanel({ core, scope, cameras, add }: AddPanelProps) {
  const { adding, closeAdd } = core.caseRun;

  if (!adding) return null;

  return (
    <AddPanelSheet
      sources={{ scope, joints: (core.project.joints ?? []).map((j) => j.id), cameras }}
      onAdd={(panel) => add(panel, adding.area)}
      onClose={closeAdd}
    />
  );
}

export function CaseRunAreas({ side }: { side: 'before' | 'after' }) {
  const running = use(CaseRunContext);

  if (!running) return null;

  const areas = running.areas[side];
  const drop = running.editor?.drag?.drop;
  const edge = running.editor?.drag && !areas.length && (
    <CanvasEdge
      key="canvas-edge"
      side={side}
      area={running.canvasAt}
      active={!!drop && 'column' in drop && drop.area === running.canvasAt && drop.column === side}
    />
  );

  return [
    ...areas.map((area) => (
      <CaseRunArea
        key={area.key}
        area={area}
        side={side}
        ctx={running.ctx}
        editor={running.editor}
        header={<ModeHeader title={running.title} onDone={running.onDone} />}
      />
    )),
    edge,
  ];
}

export function CaseRunOverlays() {
  const running = use(CaseRunContext);

  if (!running?.areas.overlays.length) return null;

  return <CodeOverlays overlays={running.areas.overlays} ctx={running.ctx} />;
}
