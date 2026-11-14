import React from 'react';
import { SectionHeader, Spinner } from '../../design-system';
import type { FrameSetManifest } from '../../vision/frameSet';
import { DatasetFrameTile } from './DatasetFrameTile';
import { TRIES_GRID } from './TryResults';

interface DatasetFramesProps {
  sets: FrameSetManifest[];
  loading: boolean;
  error: string | null;
}

export const DatasetFrames: React.FC<DatasetFramesProps> = ({ sets, loading, error }) => (
  <>
    {loading && <Spinner className="w-4 h-4 text-white/60" />}
    {error && <p className="text-[13px] text-red-400">{error}</p>}
    {sets.map((set) => (
      <section key={set.id} data-testid="dataset-images">
        <SectionHeader title={set.name} />
        <div className={TRIES_GRID}>
          {set.frames.map((id) => (
            <DatasetFrameTile key={id} id={id} classes={set.classes} />
          ))}
        </div>
      </section>
    ))}
  </>
);
