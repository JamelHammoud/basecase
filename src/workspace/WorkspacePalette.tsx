import { CommandPalette, type Command } from '../components/CommandPalette';
import { STAYS_IN_CENTER } from './caseCommands';
import { editCommands } from './editCommands';
import { sceneCommands, type CommandInputs } from './sceneCommands';
import type { CommandCenter } from './useCommandCenter';
import { viewCommands } from './viewCommands';

interface WorkspacePaletteProps {
  open: boolean;
  inputs: CommandInputs;
  onClose: () => void;
}

const leavingFirst = (commands: Command[], center: CommandCenter): Command[] =>
  commands.map((c) =>
    STAYS_IN_CENTER.has(c.id)
      ? c
      : {
          ...c,
          run: () => {
            center.leave();
            c.run();
          },
        },
  );

function OpenPalette({ inputs, onClose }: Omit<WorkspacePaletteProps, 'open'>) {
  const all = [...sceneCommands(inputs), ...editCommands(inputs), ...viewCommands(inputs)];
  const center = inputs.core.commandCenter;
  const commands = center.open ? leavingFirst(all, center) : all;

  return <CommandPalette open onClose={onClose} commands={commands} />;
}

export function WorkspacePalette({ open, inputs, onClose }: WorkspacePaletteProps) {
  if (!open) return null;

  return <OpenPalette inputs={inputs} onClose={onClose} />;
}
