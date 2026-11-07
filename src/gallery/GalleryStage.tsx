import React, { useEffect, useEffectEvent, useRef } from 'react';
import { scaledToReach } from '../cases/scale';
import { robotFacts } from '../cases/robotFit';
import { worldItem } from '../cases/schema';
import { DriveOverlay } from '../components/simulate/DriveOverlay';
import { DriveKeys, SIM_ONLY } from '../components/simulate/CaseSections';
import { Viewport3D, type Viewport3DHandle } from '../components/Viewport3D';
import { Button, RunIcon, StopIcon } from '../design-system';
import { useSimulation } from '../sim/useSimulation';
import { DEFAULT_PROJECT, type ProjectSettings, type SculptSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { GalleryBundle } from './galleryBundle';
import { seeInside } from './seeInside';

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
      state: () => ({ status: sim.status, drive: drive.status, note: drive.note, stats: sim.stats }),
    };
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
      <aside
        className="glass absolute left-4 top-4 w-[300px] rounded-[12px] p-4 flex flex-col gap-3"
        data-testid="gallery-card"
      >
        <div>
          <h1 className="text-[15px] font-semibold text-white/90">{kase.name}</h1>
          <p className="mt-1 text-[13px] leading-snug text-white/70">{kase.brief}</p>
          <p className="mt-1 text-[12px] text-white/45">{SIM_ONLY}</p>
        </div>
        <Button
          variant="primary"
          size="md"
          fullWidth
          icon={drive.active ? <StopIcon className="w-4 h-4" /> : <RunIcon className="w-4 h-4" />}
          disabled={sim.status !== 'ready' || drive.status === 'checking'}
          onClick={() => (drive.active ? drive.stop() : void drive.start())}
        >
          {drive.active ? 'Stop Driving' : 'Drive'}
        </Button>
        {drive.status === 'checking' && <p className="text-[12.5px] text-white/50">Checking it stays up</p>}
        {drive.note && <p className="text-[12.5px] leading-snug text-white/60">{drive.note}</p>}
        {drive.active && drive.cls && <DriveKeys cls={drive.cls} />}
        <Button variant="secondary" size="md" fullWidth onClick={() => void seeInside(bundle)}>
          See Inside
        </Button>
      </aside>
    </div>
  );
};
