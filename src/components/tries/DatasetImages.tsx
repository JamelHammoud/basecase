import React from 'react';
import type { Dataset } from '../../datasets/datasetFile';
import { SectionHeader } from '../../design-system';
import { DatasetImageTile } from './DatasetImageTile';
import { TRIES_GRID } from './TryResults';

export const DatasetImages: React.FC<{ dataset: Dataset }> = ({ dataset }) => {
  const frames = (dataset.imageMembers ?? []).flatMap((member) =>
    member.frameIds.map((frameId) => ({ setId: member.frameSetId, frameId })),
  );

  if (!frames.length) return null;

  return (
    <section data-testid="dataset-images">
      <SectionHeader title="Images" />
      <div className={TRIES_GRID}>
        {frames.map((frame) => (
          <DatasetImageTile key={`${frame.setId}:${frame.frameId}`} {...frame} />
        ))}
      </div>
    </section>
  );
};
