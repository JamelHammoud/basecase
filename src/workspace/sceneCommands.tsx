import type { Command } from '../components/CommandPalette';
import {
  BotIcon,
  BrushIcon,
  CheckIcon,
  CommentIcon,
  DeleteIcon,
  EraserIcon,
  MarkerIcon,
  MoveIcon,
  PenIcon,
  PhotoIcon,
  PoseIcon,
  PrinterIcon,
  WalkIcon,
  RotateIcon,
  RotateLeftIcon,
  RulerIcon,
  RunIcon,
  ScaleIcon,
} from '../design-system';
import { ROBOT_PRESETS } from '../utils/robotImport';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';
import { caseCommands } from './caseCommands';
import { skillCommands } from './skillCommands';
import { skeletonCommands } from './skeletonCommands';
import { fitTestCommands, mergeCommands } from './printCommands';
import { slashPaletteCommands } from './slashPaletteCommands';
import { routineCommands } from './routineCommands';
import { coachCommands } from './coachCommands';
import { exchangeCommands } from './exchangeCommands';
import { inputCommands } from './inputCommands';
import { operateCommands } from './operateCommands';
import { buildCommands } from './buildCommands';
import { leaderCommands } from './leaderCommands';
import { onshapeCommands } from './onshapeCommands';
import { keyFor } from '../app/shortcuts';
import { fileCommands } from './fileCommands';
import { simCommands } from './simCommands';
import type { AgentSession } from './useAgentSession';

export interface CommandInputs {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
  clipboard: { copyViaCommand: (cut: boolean) => void; pasteParts: () => void };
  agent: Pick<AgentSession, 'chat'>;
}

function printCommands({ core, actions }: CommandInputs): Command[] {
  const { exports } = actions;
  const export3mf: Command = {
    id: 'export-3mf',
    group: 'Scene',
    label: 'Export 3MF Plates',
    icon: <PrinterIcon />,
    keywords: 'print plates slicer bambu prusa orca download',
    run: () => void exports.export3mf(),
  };

  return [
    ...(exports.canExportPlates ? [export3mf] : []),
    {
      id: 'lay-out-plates',
      group: 'Scene',
      label: 'Print',
      shortcut: keyFor('print'),
      icon: <PrinterIcon />,
      keywords: 'lay out plates bed printer slice',
      run: () => core.printing.openMode(1),
    },
    {
      id: 'check-ready',
      group: 'Scene',
      label: 'Run Checks',
      icon: <CheckIcon />,
      keywords: 'ready to build buildable audit blockers build check assemble case fit robot',
      run: () => {
        core.tool.setRightTab('build');
        void core.readiness.checkNow();
      },
    },
    ...fitTestCommands({ core }),
    ...mergeCommands({ core }),
    {
      id: 'slice-plates',
      group: 'Scene',
      label: 'Slice Plates',
      icon: <PrinterIcon />,
      keywords: 'print slicer bambu studio orca gcode',
      run: () => void core.printing.job.runSlice(),
    },
  ];
}

function createCommands({ core, actions, ui }: CommandInputs): Command[] {
  const { studio } = core;

  return [
    {
      id: 'toggle-ref-images',
      group: 'View',
      label: studio.showReferenceImages ? 'Hide Reference Images' : 'Show Reference Images',
      shortcut: keyFor('toggle-reference-images'),
      icon: <PhotoIcon />,
      keywords: 'photo picture',
      run: ui.toggleReferenceImages,
    },
    {
      id: 'ref-image',
      group: 'Scene',
      label: 'Add Reference Image',
      icon: <PhotoIcon />,
      keywords: 'photo picture paste plane',
      run: () => actions.creation.pickReferenceImage(),
    },
    {
      id: 'sketch',
      group: 'Scene',
      label: 'Sketch',
      icon: <PenIcon />,
      keywords: 'draw extrude revolve outline face dimension constraint',
      run: core.sketching.open,
    },
  ];
}

function toolCommands({ core }: CommandInputs): Command[] {
  const { studio, tool } = core;
  const sculpt: Command[] = studio.sculptEnabled
    ? [
        {
          id: 'tool-sculpt',
          group: 'Tools',
          label: 'Sculpt',
          shortcut: keyFor('sculpt'),
          icon: <BrushIcon />,
          run: () => tool.setMode('sculpt'),
        },
      ]
    : [];

  return [
    {
      id: 'tool-move',
      group: 'Tools',
      label: 'Move',
      shortcut: keyFor('move'),
      icon: <MoveIcon />,
      run: () => tool.setMode('translate'),
    },
    {
      id: 'tool-rotate',
      group: 'Tools',
      label: 'Rotate',
      shortcut: keyFor('rotate'),
      icon: <RotateIcon />,
      run: () => tool.setMode('rotate'),
    },
    {
      id: 'tool-scale',
      group: 'Tools',
      label: 'Scale',
      shortcut: keyFor('scale'),
      icon: <ScaleIcon />,
      run: () => tool.setMode('scale'),
    },
    ...sculpt,
  ];
}

function poseCommands({ core, actions }: CommandInputs): Command[] {
  const { posing } = core;
  const { pose } = actions;

  if (!posing.hasRig) return [];

  const walk: Command[] = pose.canWalk
    ? [
        {
          id: 'walk-cycle',
          group: 'Pose',
          label: 'New Walk Cycle',
          icon: <WalkIcon />,
          keywords: 'gait animation legs',
          run: pose.walkCycle,
        },
      ]
    : [];

  return [
    {
      id: 'tool-pose',
      group: 'Panels',
      label: 'Show Pose',
      shortcut: keyFor('show-pose'),
      icon: <PoseIcon />,
      keywords: 'joints posing animate dof tab',
      run: pose.openPose,
    },
    {
      id: 'rest-pose',
      group: 'Pose',
      label: 'Rest Pose',
      icon: <RotateLeftIcon />,
      keywords: 'reset zero home',
      run: () => posing.setRobotPose({ values: {} }),
    },
    ...walk,
    ...posing.animations.map((a) => ({
      id: `play-${a.id}`,
      group: 'Pose',
      label: `Play ${a.name}`,
      icon: <RunIcon />,
      keywords: 'animation',
      run: () => {
        pose.openPose();
        posing.play(a.id);
      },
    })),
    ...posing.poses.map((p) => ({
      id: `pose-${p.id}`,
      group: 'Pose',
      label: `Apply ${p.name}`,
      icon: <PoseIcon />,
      keywords: 'pose',
      run: () => posing.applySavedPose(p.id),
    })),
  ];
}

function robotCommands({ core, actions }: CommandInputs): Command[] {
  const { robots } = actions;

  return [
    {
      id: 'import-robot',
      group: 'Scene',
      label: 'Import Robot',
      icon: <BotIcon />,
      keywords: 'urdf mjcf mujoco ros unitree g1 humanoid description',
      run: robots.openImportRobot,
    },
    ...ROBOT_PRESETS.map((r) => ({
      id: `robot-${r.id}`,
      group: 'Robots',
      label: `Insert ${r.title}`,
      icon: <BotIcon />,
      keywords: `${r.maker} urdf robot ${r.description}`,
      run: () => void robots.pickRobot(r),
    })),
    {
      id: 'tool-comment',
      group: 'Tools',
      label: 'Comment',
      shortcut: keyFor('comment'),
      icon: <CommentIcon />,
      keywords: 'annotation note pin',
      run: () => core.annotations.toggleCommentMode(true),
    },
    {
      id: 'tool-measure',
      group: 'Tools',
      label: 'Measure',
      shortcut: keyFor('measure'),
      icon: <RulerIcon />,
      keywords: 'distance ruler dimension tape length',
      run: () => core.tool.toggleMeasure(true),
    },
    {
      id: 'tool-annotate',
      group: 'Tools',
      label: 'Annotate',
      shortcut: keyFor('annotate'),
      icon: <MarkerIcon />,
      keywords: 'mark draw circle pen markup highlight red line',
      run: () => core.tool.toggleMarking(true),
    },
    ...(core.marks.marks.length
      ? [
          {
            id: 'tool-erase-marks',
            group: 'Tools',
            label: 'Eraser',
            shortcut: keyFor('eraser'),
            icon: <EraserIcon />,
            keywords: 'annotate erase marks remove delete one mark rub out',
            run: () => {
              core.tool.toggleMarking(true);
              core.marks.setTool('eraser');
            },
          },
          {
            id: 'tool-delete-marks',
            group: 'Tools',
            label: 'Delete Marks',
            icon: <DeleteIcon />,
            keywords: 'annotate erase remove clear red lines',
            run: core.marks.deleteAll,
          },
        ]
      : []),
  ];
}

export const sceneCommands = (inputs: CommandInputs): Command[] => [
  ...fileCommands(inputs),
  ...exchangeCommands(inputs),
  ...printCommands(inputs),
  ...buildCommands(inputs),
  ...simCommands(inputs),
  ...createCommands(inputs),
  ...toolCommands(inputs),
  ...poseCommands(inputs),
  ...skeletonCommands(inputs),
  ...robotCommands(inputs),
  ...leaderCommands(inputs),
  ...onshapeCommands(inputs),
  ...caseCommands(inputs),
  ...skillCommands(inputs),
  ...slashPaletteCommands(inputs),
  ...routineCommands(inputs),
  ...coachCommands(inputs),
  ...operateCommands(inputs),
  ...inputCommands(inputs),
];
