import React, { useEffect, useEffectEvent, useRef } from 'react';
import type { SeedReplay } from '../cases/seedReplay';
import { GalleryReplayControls } from './GalleryReplayControls';
import { scaledToReach } from '../cases/scale';
import { robotFacts } from '../cases/robotFit';
import { caseWorldItems } from '../cases/importedWorldItems';
import { caseWorldView } from '../cases/worldView';
import { DriveOverlay } from '../components/simulate/DriveOverlay';
import { Viewport3D, type Viewport3DHandle } from '../components/Viewport3D';
import { forgeHook } from '../forge/forgeHook';
import { useSimulation } from '../sim/useSimulation';
import { DEFAULT_PROJECT, type ProjectSettings, type SculptSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { GalleryCard } from './GalleryCard';
import type { GalleryBundle } from './galleryBundle';
import type { GalleryConsoleView } from './GalleryConsole';
import { openGalleryScene } from './openGalleryScene';
import { useGalleryTraining } from './useGalleryTraining';

const SCULPT: SculptSettings = { brush: 'inflate', radiusMm: 10, strength: 0.5, symmetryX: false, symmetryZ: false };
const NO_POSE = new Map();

export const GalleryStage: React.FC<{
  bundle: GalleryBundle;
  Console: GalleryConsoleView | null;
  replay?: SeedReplay;
}> = ({ bundle, Console, replay }) => {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const { parts, joints } = bundle.robot;
  const project: ProjectSettings = { ...DEFAULT_PROJECT, joints };
  const rig = buildRig(joints, parts);
  const sim = useSimulation({ parts, project, rig, pose: undefined, viewportRef, restDeltas: NO_POSE });
  const { drive } = sim;
  const kase = bundle.case;
  const facts = robotFacts(rig, parts);
  const training = useGalleryTraining({ slug: bundle.slug, morphology: facts.morphology, sim });
  const world = caseWorldItems(replay?.kase ?? scaledToReach(kase, facts.reachMm, facts.anchor));
  const begin = useEffectEvent((current: () => boolean) => {
    sim.setWorld(world);

    if (!replay) {
      void sim.start();

      return;
    }

    void sim.start(replay.model).then(async () => {
      if (!current()) return;

      await sim.scrub(replay.recording, replay.efforts);

      if (current()) sim.seek(replay.trips[0]?.frame ?? 0);
    });
  });

  useEffect(() => {
    let live = true;
    const soon = setTimeout(() => begin(() => live), 0);

    return () => {
      live = false;
      clearTimeout(soon);
    };
  }, [replay]);

  useEffect(() => {
    (window as unknown as { __gallery?: unknown }).__gallery = {
      state: () => ({
        status: sim.status,
        drive: drive.status,
        offer: drive.offer,
        stats: sim.latestStats() ?? sim.stats,
        controller: sim.controller.kind,
        skill: training.running,
        rows: training.rows.map((row) => ({ label: row.label, state: row.state.kind })),
      }),
      stubTabEngine: training.stubTabEngine,
    };
    (window as unknown as { __forge?: unknown }).__forge = forgeHook(training);
  });

  const canvas = (
    <div className="absolute inset-0">
      <Viewport3D
        ref={viewportRef}
        parts={parts}
        worldParts={sim.worldParts}
        importedWorld={caseWorldView(kase)}
        selectedPartIds={[]}
        transformMode="translate"
        sculptSettings={SCULPT}
        snapStepMm={1}
        snapAngleDeg={15}
        trackpadMode="orbit-scroll"
        showGrid
        onCommitSculptMesh={() => {}}
        onSelectPart={() => {}}
        onUpdatePartTransform={() => {}}
      />
      {!replay && <DriveOverlay sim={sim} />}
    </div>
  );
  const card = (docked: boolean) => (
    <GalleryCard
      kase={kase}
      sim={sim}
      training={training}
      docked={docked}
      replayControls={replay ? <GalleryReplayControls key={replay.seed} replay={replay} sim={sim} /> : undefined}
      onOpenScene={() => void training.carried().then((trained) => openGalleryScene(bundle, trained ?? bundle.trained))}
    />
  );

  if (Console && kase.console)
    return (
      <Console
        kase={kase}
        caseConsole={kase.console}
        sim={sim}
        rig={rig}
        parts={parts}
        joints={joints}
        canvas={canvas}
        card={card}
      />
    );

  return (
    <div className="fixed inset-0 bg-[#1b1b1b] text-white">
      {canvas}
      {card(false)}
    </div>
  );
};
