import type { Command } from '../components/CommandPalette';
import { DownloadIcon, ShareIcon, SpreadsheetIcon, TrainIcon } from '../design-system';
import { TRIES_TO_TRAIN } from '../skills/triesTraining';
import { showNewCase } from './caseCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

function makeCommands({ triesView, datasets, simTraining }: WorkspaceCore): Command[] {
  const { caseDataset } = simTraining.cases;
  const fromView = triesView.open && triesView.order.length > 0;

  if (!fromView && !caseDataset.canMake) return [];

  return [
    {
      id: 'dataset-make',
      group: 'Simulate',
      label: 'Make Dataset',
      icon: <SpreadsheetIcon />,
      keywords: 'dataset tries search selection version lerobot gr00t groot episodes',
      run: () => (fromView ? datasets.makeFromView() : caseDataset.make()),
    },
  ];
}

function openDatasetCommands(core: WorkspaceCore): Command[] {
  const { triesView, datasets, simTraining } = core;
  const dataset = triesView.open ? triesView.dataset : null;
  const { dataset: exporter, fromTries } = simTraining.cases;

  if (!dataset || exporter.exporting) return [];

  const commands: Command[] = [
    {
      id: 'case-export-dataset',
      group: 'Simulate',
      label: 'Export Dataset',
      icon: <DownloadIcon />,
      keywords: 'lerobot gr00t groot demonstrations training data video parquet',
      run: () => datasets.exportDataset(dataset),
    },
  ];

  if (exporter.canPublish)
    commands.push({
      id: 'case-publish-dataset',
      group: 'Simulate',
      label: 'Publish to Hugging Face',
      icon: <ShareIcon />,
      keywords: 'hub upload share dataset lerobot gr00t groot hf',
      run: () => datasets.publishDataset(dataset),
    });

  const passed = exporter.records.of(dataset).filter((t) => t.passed).length;

  if (fromTries.canTrain && !fromTries.busy && passed >= TRIES_TO_TRAIN)
    commands.push({
      id: 'case-train-from-tries',
      group: 'Simulate',
      label: 'Train from Tries',
      icon: <TrainIcon />,
      keywords: 'policy imitation behaviour behavior cloning learn demonstrations demos act lerobot skill dataset',
      run: () => datasets.train(dataset, () => showNewCase(core)),
    });

  return commands;
}

export const datasetCommands = (core: WorkspaceCore): Command[] => [
  ...makeCommands(core),
  ...openDatasetCommands(core),
];
