import type { Command } from '../components/CommandPalette';
import {
  BotIcon,
  CopyIcon,
  CutIcon,
  FloorIcon,
  GroupIcon,
  IntersectIcon,
  LayersIcon,
  PasteIcon,
  SubtractIcon,
  UngroupIcon,
  UnionIcon,
} from '../design-system';
import { ALIGN_AXES } from '../components/alignActions';
import type { CommandInputs } from './sceneCommands';
import { handJointCommands } from './jointCommands';

const ic = 'w-4 h-4';

function clipboardCommands({ core, actions, clipboard }: CommandInputs): Command[] {
  const { edits } = actions;

  return [
    {
      id: 'select-all',
      group: 'Selection',
      label: 'Select All',
      shortcut: '⌘A',
      icon: <LayersIcon className={ic} />,
      run: core.selection.selectAll,
    },
    {
      id: 'copy',
      group: 'Selection',
      label: 'Copy',
      shortcut: '⌘C',
      icon: <CopyIcon className={ic} />,
      run: () => clipboard.copyViaCommand(false),
    },
    {
      id: 'cut',
      group: 'Selection',
      label: 'Cut',
      shortcut: '⌘X',
      icon: <CutIcon className={ic} />,
      run: () => clipboard.copyViaCommand(true),
    },
    {
      id: 'paste',
      group: 'Selection',
      label: 'Paste',
      shortcut: '⌘V',
      icon: <PasteIcon className={ic} />,
      run: clipboard.pasteParts,
    },
    {
      id: 'group',
      group: 'Selection',
      label: 'Group',
      shortcut: '⌘G',
      icon: <GroupIcon className={ic} />,
      run: edits.group,
    },
    {
      id: 'ungroup',
      group: 'Selection',
      label: 'Ungroup',
      shortcut: '⇧⌘G',
      icon: <UngroupIcon className={ic} />,
      run: edits.ungroup,
    },
  ];
}

function wrapCommands({ actions }: CommandInputs): Command[] {
  if (!actions.wrap.canWrap()) return [];

  return [
    {
      id: 'wrap-robot',
      group: 'Selection',
      label: 'Wrap Robot',
      icon: <BotIcon className={ic} />,
      keywords: 'shell skin character mesh cover body printable',
      run: actions.wrap.wrapSelected,
    },
  ];
}

function arrangeCommands({ actions }: CommandInputs): Command[] {
  const { edits, ops } = actions;

  return [
    {
      id: 'union',
      group: 'Selection',
      label: 'Union',
      icon: <UnionIcon className={ic} />,
      keywords: 'boolean merge combine',
      run: () => ops.runBoolean('union'),
    },
    {
      id: 'subtract',
      group: 'Selection',
      label: 'Subtract',
      icon: <SubtractIcon className={ic} />,
      keywords: 'boolean cut hole difference',
      run: () => ops.runBoolean('subtract'),
    },
    {
      id: 'intersect',
      group: 'Selection',
      label: 'Intersect',
      icon: <IntersectIcon className={ic} />,
      keywords: 'boolean common',
      run: () => ops.runBoolean('intersect'),
    },
    ...ALIGN_AXES.flatMap(({ axis, aligns }) =>
      aligns.map((a) => ({
        id: a.id,
        group: 'Selection',
        label: a.label,
        icon: <a.icon className={ic} />,
        keywords: a.keywords,
        run: () => edits.align(axis, a.mode),
      })),
    ),
    ...ALIGN_AXES.map(({ axis, spread }) => ({
      id: spread.id,
      group: 'Selection',
      label: spread.label,
      icon: <spread.icon className={ic} />,
      keywords: 'distribute space evenly',
      run: () => edits.distribute(axis),
    })),
    {
      id: 'floor',
      group: 'Tools',
      label: 'Drop to Floor',
      shortcut: 'F',
      icon: <FloorIcon className={ic} />,
      run: edits.dropToGround,
    },
    {
      id: 'stack',
      group: 'Tools',
      label: 'Stack on Part Below',
      shortcut: 'S',
      icon: <LayersIcon className={ic} />,
      run: edits.stackOnBelow,
    },
  ];
}

export const editCommands = (inputs: CommandInputs): Command[] => [
  ...wrapCommands(inputs),
  ...clipboardCommands(inputs),
  ...handJointCommands(inputs.actions.joints),
  ...arrangeCommands(inputs),
];
