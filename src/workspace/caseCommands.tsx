import type { Command } from '../components/CommandPalette';
import {
  CameraIcon,
  CasesIcon,
  CompareIcon,
  DownloadIcon,
  DuplicateIcon,
  EditIcon,
  ExpandIcon,
  PlusIcon,
  RotateLeftIcon,
  RunIcon,
  ShareIcon,
  StopIcon,
  SwapIcon,
} from '../design-system';
import type { Room } from '../cases/roomPlan';
import { INPUT_COMMANDS } from './inputCommands';
import { datasetCommands } from './datasetCommands';
import { showLeftTab } from './showView';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

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
  icon: <ExpandIcon />,
  keywords: 'case app console teleop cameras joints tries operator dashboard',
  run: core.caseRun.enter,
});

function multiplyCommands({ multiply }: WorkspaceCore['simTraining']['cases']): Command[] {
  const { latest } = multiply;

  if (!latest) return [];

  return [
    {
      id: 'case-multiply',
      group: 'Simulate',
      label: 'Multiply',
      icon: <DuplicateIcon />,
      keywords: 'try variations demonstrations dataset augment generate jitter',
      run: () => multiply.multiply(latest),
    },
  ];
}

function matCommands({ simTraining, tool }: WorkspaceCore): Command[] {
  const { cases } = simTraining;
  const { active, mat, realTry, attempt } = cases;

  if (!active || !mat.available) return [];

  const exportMat: Command = {
    id: 'case-export-mat',
    group: 'Simulate',
    label: 'Export Case Mat',
    icon: <DownloadIcon />,
    keywords: 'print pdf floor apriltag tags camera track real robot',
    run: mat.exportMat,
  };
  const tryReal: Command = {
    id: 'case-try-real',
    group: 'Simulate',
    label: `Try ${active.name} on Real Robot`,
    icon: <CameraIcon />,
    keywords: 'case camera mat apriltag tags track physical hardware attempt',
    run: () => {
      tool.setRightTab('sim');
      void realTry.start();
    },
  };
  const idle = realTry.canStart && attempt.phase === 'idle';

  return [exportMat, ...(idle ? [tryReal] : [])];
}

function renameCommands(core: WorkspaceCore): Command[] {
  const { active, naming } = core.simTraining.cases;

  if (!active || core.caseRun.open) return [];

  return [
    {
      id: 'case-rename',
      group: 'Simulate',
      label: 'Rename Case',
      icon: <EditIcon />,
      keywords: 'case name title',
      run: () => {
        showCases(core);
        naming.start(active.id);
      },
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
      icon: <ShareIcon />,
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
    icon: <CompareIcon />,
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
      icon: <SwapIcon />,
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
        icon: <StopIcon />,
        run: sim.drive.stop,
      }
    : {
        id: 'drive-start',
        group: 'Simulate',
        label: 'Drive',
        icon: <RunIcon />,
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
          icon: <RotateLeftIcon />,
          keywords: 'respawn reset fell',
          run: sim.drive.respawn,
        },
      ]
    : [];
  const tryIt: Command[] =
    cases.active && cases.realTry.phase === 'idle'
      ? [
          {
            id: 'case-try',
            group: 'Simulate',
            label: `Try ${cases.active.name}`,
            icon: <RunIcon />,
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
          icon: <PlusIcon />,
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
      icon: <CasesIcon />,
      keywords: 'challenge world goal level',
      run: () => showCases(core),
    },
    ...newCase,
    drive,
    ...respawn,
    ...tryIt,
    ...caseRun,
    ...renameCommands(core),
    ...(cases.active ? compareCommands(core) : []),
    ...exploreCommands(core),
    ...matCommands(core),
    ...(cases.active ? multiplyCommands(cases) : []),
    ...datasetCommands(core),
    ...shareCommands(simTraining),
  ];
}
