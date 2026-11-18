import type { VisionTrainingView } from '../components/tries/visionTrainingView';
import { requestVisionInspection } from '../components/tries/visionInspectionCommand';
import type { Command } from '../components/CommandPalette';
import { CompareIcon, DownloadIcon, ShareIcon, SpreadsheetIcon, StopIcon, TrainIcon } from '../design-system';
import { TRIES_TO_TRAIN } from '../skills/triesTraining';
import { imageCount } from '../datasets/datasetView';
import { showNewCase } from './caseCommands';
import type { WorkspaceCore } from './useWorkspaceCore';
import { datasetVisionView } from './visionTrainingView';

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

function inspectionCommands(vision: VisionTrainingView): Command[] {
  const inspection = vision.attempts.findLast((attempt) => attempt.inspection);
  const context = vision.inspectionContext;

  if (!inspection || !context) return [];

  return [
    {
      id: 'vision-inspect-images',
      group: 'Simulate',
      label: 'Inspect Images',
      icon: <SpreadsheetIcon />,
      keywords: 'comparison evaluation failures misses false positives candidate incumbent frozen images',
      run: () => requestVisionInspection({ id: inspection.id, context }),
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
  const images = imageCount(dataset) > 0;
  const canTrain = images
    ? datasets.vision.canTrain && !datasets.vision.busy
    : fromTries.canTrain && !fromTries.busy && passed >= TRIES_TO_TRAIN;

  if (images && datasets.vision.datasetId === dataset.id)
    commands.push({
      id: 'vision-training-stop',
      group: 'Simulate',
      label: 'Stop Training',
      icon: <StopIcon />,
      keywords: 'cancel vision image training',
      run: datasets.vision.stop,
    });

  if (canTrain)
    commands.push({
      id: 'case-train-from-tries',
      group: 'Simulate',
      label: images ? 'Train' : 'Train from Tries',
      icon: <TrainIcon />,
      keywords:
        'policy imitation behaviour behavior cloning learn demonstrations demos act lerobot skill dataset vision images detect segment keypoints classify',
      run: () => datasets.train(dataset, () => showNewCase(core)),
    });

  if (images) {
    const vision = datasetVisionView(core);

    commands.push(...inspectionCommands(vision));

    const retained = vision.attempts.find((attempt) => attempt.active);

    commands.push(
      ...vision.targets
        .filter(() => !!retained)
        .map((target) => ({
          id: `vision-apply-${target.id}`,
          group: 'Simulate',
          label: `Apply Model to ${target.name}`,
          icon: <TrainIcon />,
          keywords: 'retained vision camera perception node',
          run: () => vision.apply(retained!.id, target.id),
        })),
    );
  }

  return commands;
}

export const datasetCommands = (core: WorkspaceCore): Command[] => [
  ...(core.triesView.canCompare
    ? [
        {
          id: 'compare-tries',
          group: 'View',
          label: 'Compare Tries',
          icon: <CompareIcon />,
          keywords: 'recordings saved runs timeline offsets alignment',
          run: core.triesView.compare,
        },
      ]
    : []),
  ...makeCommands(core),
  ...openDatasetCommands(core),
];
