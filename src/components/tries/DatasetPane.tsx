import React from 'react';
import { Button, DownloadIcon, MetaLine, RefreshIcon, ShareIcon, TrainIcon } from '../../design-system';
import type { TrySummary } from '../../cases/tryFile';
import { newestVersion, type Dataset } from '../../datasets/datasetFile';
import { datasetStats } from '../../datasets/datasetView';
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
}

function statItems(dataset: Dataset, members: TrySummary[]): React.ReactNode[] {
  const stats = datasetStats(members);
  const version = newestVersion(dataset);

  return [plural(stats.episodes, 'episode'), duration(stats.seconds), version && `Version ${version.n}`];
}

interface DatasetPaneProps {
  dataset: Dataset;
  members: TrySummary[];
  actions: DatasetActions;
}

export const DatasetPane: React.FC<DatasetPaneProps> = ({ dataset, members, actions }) => (
  <div className="px-[12px] pb-3 flex flex-col gap-2.5" data-testid="dataset-pane">
    <MetaLine className="flex-wrap text-[12.5px] text-white/60 tabular" items={statItems(dataset, members)} />
    <div className="flex flex-wrap gap-1.5">
      {dataset.query && (
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
