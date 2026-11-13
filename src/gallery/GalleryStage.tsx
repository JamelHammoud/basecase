import React, { useEffect, useEffectEvent, useRef } from 'react';
import { scaledToReach } from '../cases/scale';
import { robotFacts } from '../cases/robotFit';
import { worldItem } from '../cases/schema';
import { DriveOverlay } from '../components/simulate/DriveOverlay';
import { Viewport3D, type Viewport3DHandle } from '../components/Viewport3D';
import { forgeHook } from '../forge/forgeHook';
import { useSimulation } from '../sim/useSimulation';
import { DEFAULT_PROJECT, type ProjectSettings, type SculptSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { GalleryCard } from './GalleryCard';
import type { GalleryBundle } from './galleryBundle';
import { seeInside } from './seeInside';
import { useGalleryTraining } from './useGalleryTraining';

const SCULPT: SculptSettings = { brush: 'inflate', radiusMm: 10, strength: 0.5, symmetryX: false, symmetryZ: false };
const NO_POSE = new Map();

export const GalleryStage: React.FC<{ bundle: GalleryBundle }> = ({ bundle }) => {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const { parts, joints } = bundle.robot;
  const project: ProjectSettings = { ...DEFAULT_PROJECT, joints };
  const rig = buildRig(joints, parts);
  const sim = useSimulation({ parts, project, rig, pose: undefined, viewportRef, restDeltas: NO_POSE });
  const { drive } = sim;
  const kase = bundle.case;
  const facts = robotFacts(rig, parts);
  const training = useGalleryTraining({ slug: bundle.slug, morphology: facts.morphology, sim });
  const world = scaledToReach(kase, facts.reachMm, facts.anchor).world.objects.map(worldItem);
  const begin = useEffectEvent(() => {
    sim.setWorld(world);
    void sim.start();
  });

  useEffect(() => {
    const soon = setTimeout(begin, 0);

    return () => clearTimeout(soon);
  }, []);

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

  return (
    <div className="fixed inset-0 bg-[#1b1b1b] text-white">
      <div className="absolute inset-0">
        <Viewport3D
          ref={viewportRef}
          parts={parts}
          worldParts={sim.worldParts}
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
        <DriveOverlay sim={sim} />
      </div>
      <GalleryCard
        kase={kase}
        sim={sim}
        training={training}
        onSeeInside={() => void training.carried().then((trained) => seeInside(bundle, trained ?? bundle.trained))}
      />
    </div>
  );
};
