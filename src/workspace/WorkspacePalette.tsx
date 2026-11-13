import { CommandPalette, type Command } from '../components/CommandPalette';
import { STAYS_IN_RUN } from './caseCommands';
import { editCommands } from './editCommands';
import { sceneCommands, type CommandInputs } from './sceneCommands';
import type { CaseRun } from './useCaseRun';
import { viewCommands } from './viewCommands';

interface WorkspacePaletteProps {
  open: boolean;
  inputs: CommandInputs;
  onClose: () => void;
}

const leavingFirst = (commands: Command[], running: CaseRun): Command[] =>
  commands.map((c) =>
    STAYS_IN_RUN.has(c.id)
      ? c
      : {
          ...c,
          run: () => {
            running.leave();
            c.run();
          },
        },
  );

function OpenPalette({ inputs, onClose }: Omit<WorkspacePaletteProps, 'open'>) {
  const all = [...sceneCommands(inputs), ...editCommands(inputs), ...viewCommands(inputs)];
  const running = inputs.core.caseRun;
  const commands = running.open ? leavingFirst(all, running) : all;

  return <CommandPalette open onClose={onClose} commands={commands} />;
}

export function WorkspacePalette({ open, inputs, onClose }: WorkspacePaletteProps) {
  if (!open) return null;

  return <OpenPalette inputs={inputs} onClose={onClose} />;
}
