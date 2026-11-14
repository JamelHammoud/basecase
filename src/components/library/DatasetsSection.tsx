import React from 'react';
import { BrowseRow, SectionHeader } from '../../design-system';
import type { Dataset } from '../../datasets/datasetFile';
import { plural } from '../../../electron/plural.mjs';
import { imageCount } from '../../datasets/datasetView';

interface DatasetsSectionProps {
  datasets: Dataset[];
  onOpen: (dataset: Dataset) => void;
  onMenu: (dataset: Dataset) => (e: React.MouseEvent) => void;
}

const memberCount = (dataset: Dataset) => {
  const images = imageCount(dataset);

  if (!images) return plural(dataset.members.length, 'try', 'tries');

  if (!dataset.members.length) return plural(images, 'image');

  return `${plural(dataset.members.length, 'try', 'tries')}, ${plural(images, 'image')}`;
};

export const DatasetsSection: React.FC<DatasetsSectionProps> = ({ datasets, onOpen, onMenu }) =>
  datasets.length > 0 && (
    <section className="mt-4" data-testid="library-datasets">
      <SectionHeader title="Datasets" className="px-[8px]" />
      {datasets.map((d) => (
        <div key={d.id} onContextMenu={onMenu(d)}>
          <BrowseRow title={d.name} meta={memberCount(d)} onOpen={() => onOpen(d)} />
        </div>
      ))}
    </section>
  );
