import type { Command } from '../components/CommandPalette';
import {
  CasesIcon,
  DownloadIcon,
  DuplicateIcon,
  ExpandIcon,
  PlusIcon,
  RotateLeftIcon,
  RunIcon,
  ShareIcon,
  StopIcon,
  SwapIcon,
  TrainIcon,
} from '../design-system';
import type { Room } from '../cases/roomPlan';
import { INPUT_COMMANDS } from './inputCommands';
import { showLeftTab } from './showView';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

const ic = 'w-4 h-4';

const showCases = (core: WorkspaceCore) => showLeftTab(core, 'cases');

export const showNewCase = (core: WorkspaceCore) => {
  showCases(core);
  core.simTraining.cases.builder.start();
};

export const STAYS_IN_RUN = new Set([
  'drive-start',
  'drive-stop',
  'drive-respawn',
  'case-try',
  'case-multiply',
  'case-export-dataset',
  'case-publish-dataset',
  'case-train-from-tries',
  ...INPUT_COMMANDS,
]);

export const showRoomCase = (core: WorkspaceCore, room: Room) => {
  showCases(core);
  core.simTraining.cases.builder.startInRoom(room);
};

const runCaseCommand = (core: WorkspaceCore): Command => ({
  id: 'case-run',
  group: 'Simulate',
  label: 'Run Case',
  icon: <ExpandIcon className={ic} />,
  keywords: 'case app console teleop cameras joints tries operator dashboard',
  run: core.caseRun.enter,
});

function datasetCommands({ dataset }: WorkspaceCore['simTraining']['cases']): Command[] {
  if (dataset.exporting) return [];

  const exportDataset: Command = {
    id: 'case-export-dataset',
    group: 'Simulate',
    label: 'Export Dataset',
    icon: <DownloadIcon className={ic} />,
    keywords: 'lerobot gr00t groot demonstrations training data video parquet',
    run: dataset.exportDataset,
  };
  const publishDataset: Command = {
    id: 'case-publish-dataset',
    group: 'Simulate',
    label: 'Publish to Hugging Face',
    icon: <ShareIcon className={ic} />,
    keywords: 'hub upload share dataset lerobot gr00t groot hf',
    run: dataset.publishDataset,
  };

  return [...(dataset.canExport ? [exportDataset] : []), ...(dataset.canPublish ? [publishDataset] : [])];
}

function multiplyCommands({ multiply }: WorkspaceCore['simTraining']['cases']): Command[] {
  const { latest } = multiply;

  if (!latest) return [];

  return [
    {
      id: 'case-multiply',
      group: 'Simulate',
      label: 'Multiply',
      icon: <DuplicateIcon className={ic} />,
      keywords: 'try variations demonstrations dataset augment generate jitter',
      run: () => multiply.multiply(latest),
    },
  ];
}

function fromTriesCommands({ fromTries }: WorkspaceCore['simTraining']['cases']): Command[] {
  if (!fromTries.ready) return [];

  return [
    {
      id: 'case-train-from-tries',
      group: 'Simulate',
      label: 'Train from Tries',
      icon: <TrainIcon className={ic} />,
      keywords: 'policy imitation behaviour behavior cloning learn demonstrations demos act lerobot skill',
      run: fromTries.train,
    },
  ];
}

function shareCommands({ share }: WorkspaceCore['simTraining']): Command[] {
  if (!share.canShare || share.sharing) return [];

  return [
    {
      id: 'share-robot',
      group: 'Simulate',
      label: 'Share Robot',
      icon: <ShareIcon className={ic} />,
      keywords: 'link url web browser gallery hub hugging face publish drive',
      run: share.share,
    },
  ];
}

function compareCommands(core: WorkspaceCore): Command[] {
  const { caseCompare, tool } = core;

  return caseCompare.choices.map((choice) => ({
    id: `case-compare-${choice.tabId}`,
    group: 'Simulate',
    label: `Compare with ${choice.name}`,
    icon: <CasesIcon className={ic} />,
    keywords: 'case versus pass rate which better robot scene tab',
    run: () => {
      caseCompare.start(choice.tabId);
      tool.setRightTab('sim');
    },
  }));
}

function exploreCommands({ caseExplore, tool }: WorkspaceCore): Command[] {
  if (!caseExplore.available || caseExplore.running) return [];

  return [
    {
      id: 'case-explore',
      group: 'Simulate',
      label: 'Explore',
      icon: <SwapIcon className={ic} />,
      keywords: 'case servo version variant voltage supply sweep which buy cheaper stronger compare',
      run: () => {
        caseExplore.start();
        tool.setRightTab('sim');
      },
    },
  ];
}

export function caseCommands({ core }: CommandInputs): Command[] {
  const { simTraining, posing, tool } = core;
  const { sim, cases } = simTraining;

  if (!posing.hasRig) return [];

  const drive: Command = sim.drive.active
    ? {
        id: 'drive-stop',
        group: 'Simulate',
        label: 'Stop Driving',
        shortcut: 'Esc',
        icon: <StopIcon className={ic} />,
        run: sim.drive.stop,
      }
    : {
        id: 'drive-start',
        group: 'Simulate',
        label: 'Drive',
        icon: <RunIcon className={ic} />,
        keywords: 'keyboard gamepad play joystick',
        run: () => {
          tool.setRightTab('sim');
          void sim.drive.start();
        },
      };
  const respawn: Command[] = sim.drive.active
    ? [
        {
          id: 'drive-respawn',
          group: 'Simulate',
          label: 'Start Over',
          shortcut: 'R',
          icon: <RotateLeftIcon className={ic} />,
          keywords: 'respawn reset fell',
          run: sim.drive.respawn,
        },
      ]
    : [];
  const tryIt: Command[] = cases.active
    ? [
        {
          id: 'case-try',
          group: 'Simulate',
          label: `Try ${cases.active.name}`,
          icon: <RunIcon className={ic} />,
          keywords: 'case attempt play',
          run: () => {
            tool.setRightTab('sim');
            void cases.attempt.start();
          },
        },
      ]
    : [];

  const caseRun: Command[] = cases.active && !core.caseRun.open && !core.printing.mode ? [runCaseCommand(core)] : [];

  const newCase: Command[] = cases.builder.goals.length
    ? [
        {
          id: 'new-case',
          group: 'Simulate',
          label: 'New Case',
          icon: <PlusIcon className={ic} />,
          keywords: 'case challenge world goal level make create',
          run: () => showNewCase(core),
        },
      ]
    : [];

  return [
    {
      id: 'show-cases',
      group: 'Panels',
      label: 'Show Cases',
      icon: <CasesIcon className={ic} />,
      keywords: 'challenge world goal level',
      run: () => showCases(core),
    },
    ...newCase,
    drive,
    ...respawn,
    ...tryIt,
    ...caseRun,
    ...(cases.active ? compareCommands(core) : []),
    ...exploreCommands(core),
    ...(cases.active ? multiplyCommands(cases) : []),
    ...datasetCommands(cases),
    ...fromTriesCommands(cases),
    ...shareCommands(simTraining),
  ];
}
