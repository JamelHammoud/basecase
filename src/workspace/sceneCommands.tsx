import {
  ArrowRightLeft,
  Bot,
  Brush,
  ClipboardCopy,
  CopyPlus,
  Download,
  FileUp,
  Footprints,
  History,
  ImageDown,
  ImagePlus,
  Image as ImageIcon,
  MessageCircle,
  Move3d,
  PenTool,
  PersonStanding,
  Play,
  Rotate3d,
  RotateCcw,
  Save,
  Scale3d,
  SquarePen,
  X,
} from 'lucide-react';
import type { Command } from '../components/CommandPalette';
import { ROBOT_PRESETS } from '../utils/robotImport';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

export interface CommandInputs {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
  clipboard: { copyViaCommand: (cut: boolean) => void; pasteParts: () => void };
}

const ic = 'w-4 h-4';

function fileCommands({ core, actions }: CommandInputs): Command[] {
  const { studio, workspaceId } = core;
  const { library, exports } = actions;
  const reopen: Command[] = studio.canReopenTab
    ? [
        {
          id: 'reopen-scene',
          group: 'Scene',
          label: 'Reopen Closed Scene',
          shortcut: '⇧⌘T',
          icon: <History className={ic} />,
          keywords: 'tab undo restore',
          run: studio.reopenTab,
        },
      ]
    : [];

  return [
    {
      id: 'sync',
      group: 'Scene',
      label: 'Save Scene',
      shortcut: '⌘S',
      icon: <Save className={ic} />,
      keywords: 'sync save library ai-reference brief',
      run: library.sync,
    },
    {
      id: 'copy-brief',
      group: 'Scene',
      label: 'Copy as Markdown',
      icon: <ClipboardCopy className={ic} />,
      keywords: 'markdown clipboard export brief spec',
      run: exports.copyBrief,
    },
    {
      id: 'export',
      group: 'Scene',
      label: 'Export STL',
      icon: <Download className={ic} />,
      keywords: 'print download',
      run: exports.exportStl,
    },
    {
      id: 'export-image',
      group: 'Scene',
      label: 'Export Image',
      icon: <ImageDown className={ic} />,
      keywords: 'png screenshot render download',
      run: exports.exportImage,
    },
    {
      id: 'new',
      group: 'Scene',
      label: 'New Scene',
      shortcut: '⌘T',
      icon: <SquarePen className={ic} />,
      keywords: 'tab open',
      run: () => studio.newScene(),
    },
    {
      id: 'duplicate-scene',
      group: 'Scene',
      label: 'Duplicate Scene',
      icon: <CopyPlus className={ic} />,
      keywords: 'tab copy',
      run: () => studio.duplicateTab(workspaceId),
    },
    {
      id: 'close-scene',
      group: 'Scene',
      label: 'Close Scene',
      shortcut: '⌘W',
      icon: <X className={ic} />,
      keywords: 'tab',
      run: () => studio.closeTab(workspaceId),
    },
    ...reopen,
    ...studio.tabs
      .filter((t) => t.id !== workspaceId)
      .map((t) => ({
        id: `tab-${t.id}`,
        group: 'Open Scenes',
        label: t.name || 'Untitled',
        shortcut: studio.tabs.indexOf(t) < 9 ? `⌘${studio.tabs.indexOf(t) + 1}` : undefined,
        icon: <ArrowRightLeft className={ic} />,
        keywords: 'tab switch go to',
        run: () => studio.selectTab(t.id),
      })),
  ];
}

function createCommands({ core, actions, ui }: CommandInputs): Command[] {
  const { studio, tool } = core;

  return [
    {
      id: 'toggle-ref-images',
      group: 'View',
      label: studio.showReferenceImages ? 'Hide Reference Images' : 'Show Reference Images',
      shortcut: '⇧I',
      icon: <ImageIcon className={ic} />,
      keywords: 'photo picture',
      run: ui.toggleReferenceImages,
    },
    {
      id: 'ref-image',
      group: 'Scene',
      label: 'Add Reference Image…',
      icon: <ImageIcon className={ic} />,
      keywords: 'photo picture paste plane',
      run: () => actions.creation.pickReferenceImage(),
    },
    {
      id: 'import-svg',
      group: 'Scene',
      label: 'Import SVG…',
      icon: <FileUp className={ic} />,
      run: () => tool.openCreator('svg'),
    },
    {
      id: 'sketch',
      group: 'Scene',
      label: 'Sketch…',
      icon: <PenTool className={ic} />,
      keywords: 'draw extrude revolve outline',
      run: () => tool.openCreator('draw2d'),
    },
    {
      id: 'image',
      group: 'Scene',
      label: 'Model from Image…',
      icon: <ImagePlus className={ic} />,
      keywords: 'photo sketch agent ai',
      run: tool.requestAttach,
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
          shortcut: 'C',
          icon: <Brush className={ic} />,
          run: () => tool.setMode('sculpt'),
        },
      ]
    : [];

  return [
    {
      id: 'tool-move',
      group: 'Tools',
      label: 'Move',
      shortcut: 'V',
      icon: <Move3d className={ic} />,
      run: () => tool.setMode('translate'),
    },
    {
      id: 'tool-rotate',
      group: 'Tools',
      label: 'Rotate',
      shortcut: 'E',
      icon: <Rotate3d className={ic} />,
      run: () => tool.setMode('rotate'),
    },
    {
      id: 'tool-scale',
      group: 'Tools',
      label: 'Scale',
      shortcut: 'R',
      icon: <Scale3d className={ic} />,
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
          icon: <Footprints className={ic} />,
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
      shortcut: 'P',
      icon: <PersonStanding className={ic} />,
      keywords: 'joints posing animate dof tab',
      run: pose.openPose,
    },
    {
      id: 'rest-pose',
      group: 'Pose',
      label: 'Rest Pose',
      icon: <RotateCcw className={ic} />,
      keywords: 'reset zero home',
      run: () => posing.setRobotPose({ values: {} }),
    },
    ...walk,
    {
      id: 'import-bvh',
      group: 'Pose',
      label: 'Import BVH…',
      icon: <FileUp className={ic} />,
      keywords: 'mocap motion capture retarget animation',
      run: pose.importMotion,
    },
    ...posing.animations.map((a) => ({
      id: `play-${a.id}`,
      group: 'Pose',
      label: `Play ${a.name}`,
      icon: <Play className={ic} />,
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
      icon: <PersonStanding className={ic} />,
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
      label: 'Import Robot…',
      icon: <Bot className={ic} />,
      keywords: 'urdf mjcf mujoco ros unitree g1 humanoid description',
      run: robots.openImportRobot,
    },
    ...ROBOT_PRESETS.map((r) => ({
      id: `robot-${r.id}`,
      group: 'Robots',
      label: `Insert ${r.title}`,
      icon: <Bot className={ic} />,
      keywords: `${r.maker} urdf robot ${r.description}`,
      run: () => void robots.pickRobot(r),
    })),
    {
      id: 'tool-comment',
      group: 'Tools',
      label: 'Comment',
      shortcut: 'M',
      icon: <MessageCircle className={ic} />,
      keywords: 'annotation note pin',
      run: () => core.annotations.toggleCommentMode(true),
    },
  ];
}

export const sceneCommands = (inputs: CommandInputs): Command[] => [
  ...fileCommands(inputs),
  ...createCommands(inputs),
  ...toolCommands(inputs),
  ...poseCommands(inputs),
  ...robotCommands(inputs),
];
