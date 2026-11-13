import React from 'react';
import type { Case } from '../cases/schema';
import { DriveKeys } from '../components/simulate/CaseSections';
import { SkillsList } from '../components/simulate/SkillsList';
import { Button, RunIcon, StopIcon, TrainIcon } from '../design-system';
import type { Simulation } from '../sim/useSimulation';
import type { GalleryTraining } from './useGalleryTraining';

const TrainPart: React.FC<{ training: GalleryTraining }> = ({ training }) => {
  if (!training.offered) return null;

  if (training.rows.length) return <SkillsList rows={training.rows} actions={training.actions} />;

  return (
    <Button
      variant="secondary"
      size="md"
      fullWidth
      icon={<TrainIcon className="w-4 h-4" />}
      disabled={training.starting}
      onClick={() => void training.train()}
    >
      Train
    </Button>
  );
};

export const GalleryCard: React.FC<{
  kase: Case;
  sim: Simulation;
  training: GalleryTraining;
  docked: boolean;
  onSeeInside: () => void;
}> = ({ kase, sim, training, docked, onSeeInside }) => {
  const { drive } = sim;

  return (
    <aside
      className={`flex flex-col gap-3 ${
        docked
          ? 'px-[12px] py-3 border-b border-white/[0.06]'
          : 'glass absolute left-4 top-4 w-[300px] rounded-[12px] p-4'
      }`}
      data-testid="gallery-card"
    >
      <div>
        <h1 className="text-[15px] font-semibold text-white/90">{kase.name}</h1>
        <p className="mt-1 text-[13px] leading-snug text-white/70">{kase.brief}</p>
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
      {!docked && drive.status === 'checking' && <p className="text-[12.5px] text-white/50">Checking it stays up…</p>}
      {!docked && drive.active && drive.cls && <DriveKeys cls={drive.cls} />}
      <TrainPart training={training} />
      <Button variant="secondary" size="md" fullWidth onClick={onSeeInside}>
        See Inside
      </Button>
    </aside>
  );
};
