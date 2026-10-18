import { CommandPalette } from '../components/CommandPalette';
import { editCommands } from './editCommands';
import { sceneCommands, type CommandInputs } from './sceneCommands';
import { viewCommands } from './viewCommands';

interface WorkspacePaletteProps {
  open: boolean;
  inputs: CommandInputs;
  onClose: () => void;
}

function OpenPalette({ inputs, onClose }: Omit<WorkspacePaletteProps, 'open'>) {
  const commands = [...sceneCommands(inputs), ...editCommands(inputs), ...viewCommands(inputs)];

  return <CommandPalette open onClose={onClose} commands={commands} />;
}

export function WorkspacePalette({ open, inputs, onClose }: WorkspacePaletteProps) {
  if (!open) return null;

  return <OpenPalette inputs={inputs} onClose={onClose} />;
}
