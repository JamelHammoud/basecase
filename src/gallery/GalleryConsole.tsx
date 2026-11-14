import React, { useEffect, useState } from 'react';
import { consoleScope, type CaseConsole } from '../cases/console/format';
import { consoleLayout, type PlacedArea } from '../cases/console/layout';
import type { CaseAction } from '../cases/console/panelKinds';
import type { SignalBus } from '../cases/console/signalBus';
import { robotFacts } from '../cases/robotFit';
import { movableWorld } from '../cases/scale';
import type { Case } from '../cases/schema';
import { CaseRunArea } from '../components/caseRun/CaseRunArea';
import { CodeOverlays } from '../components/caseRun/code/CodeOverlays';
import type { PanelContext } from '../components/caseRun/panelContext';
import { LAYOUT } from '../design-system';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { useConsoleSignals } from '../workspace/useConsoleSignals';

export interface GalleryConsoleProps {
  kase: Case;
  caseConsole: CaseConsole;
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[];
  canvas: React.ReactNode;
  card: (docked: boolean) => React.ReactNode;
}

export type GalleryConsoleView = React.FC<GalleryConsoleProps>;

const GALLERY_SURFACE = { desktop: false, studio: false };

function galleryActions(sim: Simulation, bus: SignalBus) {
  const { drive } = sim;

  const can = (action: CaseAction) =>
    ({
      try: false,
      'end-try': false,
      drive: sim.status === 'ready' && !drive.active && drive.status !== 'checking',
      stop: drive.active,
      'start-over': drive.active,
      reset: sim.status !== 'off',
    })[action];

  const fire = (action: CaseAction) => {
    if (!can(action)) return;

    if (action === 'drive') void drive.start();
    else if (action === 'stop') drive.stop();
    else if (action === 'start-over') drive.respawn();
    else {
      sim.reset();
      bus.reset();
    }
  };

  return { can, fire };
}

const withoutFrames = (area: PlacedArea): PlacedArea => ({
  ...area,
  panels: area.panels.filter((p) => p.kind !== 'code'),
});

export const GalleryConsole: GalleryConsoleView = ({ kase, caseConsole, sim, rig, parts, joints, canvas, card }) => {
  const layout = consoleLayout(caseConsole, GALLERY_SURFACE);
  const bus = useConsoleSignals({ open: true, kase, caseConsole, sim, running: false, rig, parts, cameras: [] });
  const { can, fire } = galleryActions(sim, bus);
  const { setInputs } = sim.drive;
  const [framed, setFramed] = useState(false);
  const ctx: PanelContext = {
    bus,
    signals: caseConsole.signals ?? [],
    scope: consoleScope(caseConsole, kase),
    inputs: caseConsole.input,
    brief: kase.brief,
    world: movableWorld(kase, robotFacts(rig, parts)),
    sim,
    parts,
    joints,
    fire,
    can,
    studio: null,
  };

  if (!framed && sim.status === 'ready') setFramed(true);

  useEffect(() => {
    setInputs(caseConsole.input);

    return () => setInputs(null);
  }, [caseConsole.input, setInputs]);

  const areas = (side: 'before' | 'after') =>
    layout[side].map((area) => (
      <CaseRunArea
        key={area.key}
        area={framed ? area : withoutFrames(area)}
        side={side}
        ctx={ctx}
        header={card(true)}
      />
    ));

  return (
    <div className="fixed inset-0 flex bg-[#1b1b1b] text-white" style={{ padding: LAYOUT.panelGap }}>
      {areas('before')}
      <div className="relative flex-1 min-w-0 overflow-hidden rounded-[12px]">
        {canvas}
        {framed && <CodeOverlays overlays={layout.overlays} ctx={ctx} />}
        {!layout.before.length && !layout.after.length && card(false)}
      </div>
      {areas('after')}
    </div>
  );
};
