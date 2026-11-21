import React, { useState } from 'react';
import type { Dataset } from '../../datasets/datasetFile';
import { SectionHeader } from '../../design-system';
import { DatasetImageTile } from './DatasetImageTile';
import { TRIES_GRID } from './TryResults';
import { DatasetConditions } from './DatasetConditions';
import { useDatasetImageConditions } from './useDatasetImageConditions';

export const DatasetImages: React.FC<{ dataset: Dataset; onOpen?: (setId: string, frameId?: string) => void }> = ({
  dataset,
  onOpen,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const labels = useDatasetImageConditions(dataset.imageMembers);
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
      {!snapshot && selected.length > 0 && (
        <DatasetConditions
          members={dataset.imageMembers ?? []}
          selected={frames
            .filter((frame) => selected.includes(`${frame.setId}:${frame.frameId}`))
            .map((frame) => ({ frameSetId: frame.setId, frameId: frame.frameId }))}
        />
      )}
      <div className={TRIES_GRID}>
        {frames.map((frame) => (
          <DatasetImageTile
            key={`${frame.setId}:${frame.frameId}:${frame.frozen?.content ?? ''}`}
            {...frame}
            conditions={frame.frozen?.groups?.labels ?? labels?.get(`${frame.setId}:${frame.frameId}`)}
            selected={selected.includes(`${frame.setId}:${frame.frameId}`)}
            onSelect={
              !snapshot
                ? () =>
                    setSelected((previous) => {
                      const key = `${frame.setId}:${frame.frameId}`;

                      if (previous.includes(key)) return previous.filter((item) => item !== key);

                      return previous.length < 1000 ? [...previous, key] : previous;
                    })
                : undefined
            }
            onOpen={onOpen && (() => onOpen(frame.setId, frame.frameId))}
          />
        ))}
      </div>
    </section>
  );
};
