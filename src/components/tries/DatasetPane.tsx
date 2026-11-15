import React from 'react';
import { Button, DownloadIcon, MetaLine, RefreshIcon, Select, ShareIcon, TrainIcon } from '../../design-system';
import type { TrySummary } from '../../cases/tryFile';
import type { Dataset } from '../../datasets/datasetFile';
import { imageCount, totalSeconds } from '../../datasets/datasetView';
import { duration } from '../../utils/duration';
import type { TriesResult } from '../../workspace/useTriesTraining';
import { PendingRow } from '../simulate/PendingRow';
import { TriesResultRow } from './TriesResultRow';
import { plural } from '../../../electron/plural.mjs';

export interface DatasetActions {
  exporting: boolean;
  canPublish: boolean;
  canTrain: boolean;
  trainBusy: boolean;
  training: boolean;
  result: TriesResult | null;
  exportDataset: () => void;
  publishDataset: () => void;
  train: () => void;
  update: () => void;
  selectVersion: (n: number | null) => void;
}

function statItems(dataset: Dataset, members: TrySummary[]): React.ReactNode[] {
  const images = imageCount(dataset);

  return [members.length > 0 && duration(totalSeconds(members)), images > 0 && plural(images, 'image')];
}

interface DatasetPaneProps {
  dataset: Dataset;
  members: TrySummary[];
  actions: DatasetActions;
}

export const DatasetPane: React.FC<DatasetPaneProps> = ({ dataset, members, actions }) => (
  <div className="px-[12px] pb-3 flex flex-col gap-2.5" data-testid="dataset-pane">
    <MetaLine className="flex-wrap text-[12.5px] text-white/60 tabular" items={statItems(dataset, members)} />
    {dataset.versions.length > 0 && (
      <Select
        aria-label="Dataset version"
        value={dataset.selectedVersion?.toString() ?? 'working'}
        options={[
          { value: 'working', label: 'Working Dataset' },
          ...[...dataset.versions]
            .reverse()
            .map((version) => ({ value: String(version.n), label: `Version ${version.n}` })),
        ]}
        onChange={(event) =>
          actions.selectVersion(event.target.value === 'working' ? null : Number(event.target.value))
        }
      />
    )}
    <div className="flex flex-wrap gap-1.5">
      {dataset.query && !dataset.selectedVersion && (
        <Button size="sm" icon={<RefreshIcon className="w-4 h-4" />} onClick={actions.update}>
          Update
        </Button>
      )}
      <Button
        size="sm"
        disabled={actions.exporting}
        icon={<DownloadIcon className="w-4 h-4" />}
        onClick={actions.exportDataset}
      >
        Export Dataset
      </Button>
      {actions.canPublish && (
        <Button
          size="sm"
          disabled={actions.exporting}
          icon={<ShareIcon className="w-4 h-4" />}
          onClick={actions.publishDataset}
        >
          Publish to Hugging Face
        </Button>
      )}
      {actions.canTrain && (
        <Button size="sm" disabled={actions.trainBusy} icon={<TrainIcon className="w-4 h-4" />} onClick={actions.train}>
          Train from Tries
        </Button>
      )}
    </div>
    {actions.training && <PendingRow />}
    {actions.result && <TriesResultRow result={actions.result} />}
  </div>
);
