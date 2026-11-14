import type { Command } from '../components/CommandPalette';
import { CopyIcon, CutIcon, PasteIcon, SubtractIcon } from '../design-system';
import { ALIGN_AXES } from '../components/alignActions';
import type { CommandInputs } from './sceneCommands';
import { handJointCommands } from './jointCommands';
import { mirrorCommand } from './mirrorCommands';
import { keyFor } from '../app/shortcuts';
import { isRotated, onePartActions, paletteCommand, renameAction, selectionActions } from './partActions';

function clipboardCommands(inputs: CommandInputs): Command[] {
  const { actions, clipboard } = inputs;
  const act = selectionActions(inputs);
  const rename = renameAction(inputs);

  return [
    paletteCommand(act.selectAll, 'Selection'),
    {
      id: 'copy',
      group: 'Selection',
      label: 'Copy',
      shortcut: keyFor('copy'),
      icon: <CopyIcon />,
      run: () => clipboard.copyViaCommand(false),
    },
    {
      id: 'cut',
      group: 'Selection',
      label: 'Cut',
      shortcut: keyFor('cut'),
      icon: <CutIcon />,
      run: () => clipboard.copyViaCommand(true),
    },
    {
      id: 'paste',
      group: 'Selection',
      label: 'Paste',
      shortcut: keyFor('paste'),
      icon: <PasteIcon />,
      run: clipboard.pasteParts,
    },
    ...(rename ? [paletteCommand(rename, 'Selection')] : []),
    paletteCommand(act.duplicate, 'Selection'),
    paletteCommand(act.group, 'Selection'),
    mirrorCommand(actions.mirror),
    paletteCommand(act.ungroup, 'Selection'),
    paletteCommand(act.saveToLibrary, 'Selection'),
    paletteCommand(act.remove, 'Selection'),
  ];
}

function wrapCommands(inputs: CommandInputs): Command[] {
  if (!inputs.actions.wrap.canWrap()) return [];

  return [paletteCommand(selectionActions(inputs).wrap, 'Selection')];
}

function armCommands(inputs: CommandInputs): Command[] {
  if (!inputs.actions.arm.canSize) return [];

  return [paletteCommand(selectionActions(inputs).sizeArm, 'Selection')];
}

function onePartCommands(inputs: CommandInputs): Command[] {
  const [part, ...others] = inputs.core.selection.selectedParts;

  if (!part || others.length > 0) return [];

  const one = onePartActions(inputs, part);

  return [...(isRotated(part) ? [one.resetRotation] : []), ...(one.quote ? [one.quote] : []), one.lock, one.hide].map(
    (action) => paletteCommand(action, 'Selection'),
  );
}

function arrangeCommands(inputs: CommandInputs): Command[] {
  const { edits, ops } = inputs.actions;
  const act = selectionActions(inputs);

  return [
    paletteCommand(act.union, 'Selection'),
    {
      id: 'subtract',
      group: 'Selection',
      label: 'Subtract',
      icon: <SubtractIcon />,
      keywords: 'boolean cut hole difference',
      run: () => ops.runBoolean('subtract'),
    },
    paletteCommand(act.intersect, 'Selection'),
    paletteCommand(act.clearanceHole, 'Selection'),
    ...ALIGN_AXES.flatMap(({ axis, aligns }) =>
      aligns.map((a) => ({
        id: a.id,
        group: 'Selection',
        label: a.label,
        icon: <a.icon />,
        keywords: a.keywords,
        run: () => edits.align(axis, a.mode),
      })),
    ),
    ...ALIGN_AXES.map(({ axis, spread }) => ({
      id: spread.id,
      group: 'Selection',
      label: spread.label,
      icon: <spread.icon />,
      keywords: 'distribute space evenly',
      run: () => edits.distribute(axis),
    })),
    paletteCommand(act.floor, 'Tools'),
    paletteCommand(act.stack, 'Tools'),
    paletteCommand(act.center, 'Tools'),
  ];
}

export const editCommands = (inputs: CommandInputs): Command[] => [
  ...wrapCommands(inputs),
  ...armCommands(inputs),
  ...clipboardCommands(inputs),
  ...onePartCommands(inputs),
  ...handJointCommands(inputs.actions.joints),
  ...arrangeCommands(inputs),
];
