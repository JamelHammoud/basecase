import {
  AlignCenterVertical,
  ArrowDownToLine,
  ClipboardPaste,
  Copy,
  Group,
  Layers,
  Scissors,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Ungroup,
} from 'lucide-react';
import type { Command } from '../components/CommandPalette';
import type { AlignMode, Axis } from '../utils/selection';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

const ALIGNS: Array<{ id: string; label: string; keywords: string; axis: Axis; mode: AlignMode }> = [
  { id: 'align-left', label: 'Align Left', keywords: 'align x', axis: 0, mode: 'min' },
  { id: 'align-center-x', label: 'Align Center (X)', keywords: 'align', axis: 0, mode: 'center' },
  { id: 'align-right', label: 'Align Right', keywords: 'align x', axis: 0, mode: 'max' },
  { id: 'align-bottom', label: 'Align Bottom', keywords: 'align y floor', axis: 1, mode: 'min' },
  { id: 'align-top', label: 'Align Top', keywords: 'align y', axis: 1, mode: 'max' },
  { id: 'align-front', label: 'Align Front', keywords: 'align z', axis: 2, mode: 'max' },
  { id: 'align-back', label: 'Align Back', keywords: 'align z', axis: 2, mode: 'min' },
];

const DISTRIBUTES: Array<{ id: string; label: string; axis: Axis }> = [
  { id: 'distribute-x', label: 'Distribute Along X', axis: 0 },
  { id: 'distribute-z', label: 'Distribute Along Z', axis: 2 },
];

function clipboardCommands({ core, actions, clipboard }: CommandInputs): Command[] {
  const { edits } = actions;

  return [
    {
      id: 'select-all',
      group: 'Selection',
      label: 'Select All',
      shortcut: '⌘A',
      icon: <Layers className={ic} />,
      run: core.selection.selectAll,
    },
    {
      id: 'copy',
      group: 'Selection',
      label: 'Copy',
      shortcut: '⌘C',
      icon: <Copy className={ic} />,
      run: () => clipboard.copyViaCommand(false),
    },
    {
      id: 'cut',
      group: 'Selection',
      label: 'Cut',
      shortcut: '⌘X',
      icon: <Scissors className={ic} />,
      run: () => clipboard.copyViaCommand(true),
    },
    {
      id: 'paste',
      group: 'Selection',
      label: 'Paste',
      shortcut: '⌘V',
      icon: <ClipboardPaste className={ic} />,
      run: clipboard.pasteParts,
    },
    {
      id: 'group',
      group: 'Selection',
      label: 'Group',
      shortcut: '⌘G',
      icon: <Group className={ic} />,
      run: edits.group,
    },
    {
      id: 'ungroup',
      group: 'Selection',
      label: 'Ungroup',
      shortcut: '⇧⌘G',
      icon: <Ungroup className={ic} />,
      run: edits.ungroup,
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
      icon: <SquaresUnite className={ic} />,
      keywords: 'boolean merge combine',
      run: () => ops.runBoolean('union'),
    },
    {
      id: 'subtract',
      group: 'Selection',
      label: 'Subtract',
      icon: <SquaresSubtract className={ic} />,
      keywords: 'boolean cut hole difference',
      run: () => ops.runBoolean('subtract'),
    },
    {
      id: 'intersect',
      group: 'Selection',
      label: 'Intersect',
      icon: <SquaresIntersect className={ic} />,
      keywords: 'boolean common',
      run: () => ops.runBoolean('intersect'),
    },
    ...ALIGNS.map((a) => ({
      id: a.id,
      group: 'Selection',
      label: a.label,
      icon: <AlignCenterVertical className={ic} />,
      keywords: a.keywords,
      run: () => edits.align(a.axis, a.mode),
    })),
    ...DISTRIBUTES.map((d) => ({
      id: d.id,
      group: 'Selection',
      label: d.label,
      icon: <AlignCenterVertical className={ic} />,
      keywords: 'spread space',
      run: () => edits.distribute(d.axis),
    })),
    {
      id: 'floor',
      group: 'Tools',
      label: 'Drop to Floor',
      shortcut: 'F',
      icon: <ArrowDownToLine className={ic} />,
      run: edits.dropToGround,
    },
    {
      id: 'stack',
      group: 'Tools',
      label: 'Stack on Part Below',
      shortcut: 'S',
      icon: <Layers className={ic} />,
      run: edits.stackOnBelow,
    },
  ];
}

export const editCommands = (inputs: CommandInputs): Command[] => [
  ...clipboardCommands(inputs),
  ...arrangeCommands(inputs),
];
