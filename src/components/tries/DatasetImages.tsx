import React from 'react';
import type { Dataset } from '../../datasets/datasetFile';
import { SectionHeader } from '../../design-system';
import { DatasetImageTile } from './DatasetImageTile';
import { TRIES_GRID } from './TryResults';

export const DatasetImages: React.FC<{ dataset: Dataset; onOpen?: (setId: string, frameId?: string) => void }> = ({
  dataset,
  onOpen,
}) => {
  const snapshot = dataset.versions.find((version) => version.n === dataset.selectedVersion)?.snapshot;
  const frames = snapshot
    ? snapshot.images.map((frozen) => ({ setId: frozen.frameSetId, frameId: frozen.frameId, frozen }))
    : (dataset.imageMembers ?? []).flatMap((member) =>
        member.frameIds.map((frameId) => ({ setId: member.frameSetId, frameId, frozen: undefined })),
      );

  if (!frames.length) return null;

  return (
    <section data-testid="dataset-images">
      <SectionHeader title="Images" />
      <div className={TRIES_GRID}>
        {frames.map((frame) => (
          <DatasetImageTile
            key={`${frame.setId}:${frame.frameId}:${frame.frozen?.content ?? ''}`}
            {...frame}
            onOpen={onOpen && (() => onOpen(frame.setId, frame.frameId))}
          />
        ))}
      </div>
    </section>
  );
};
