import { CommandPalette, type Command } from '../components/CommandPalette';
import { ErrorBoundary } from '../design-system';
import { STAYS_IN_RUN } from './caseCommands';
import { editCommands } from './editCommands';
import { sceneCommands, type CommandInputs } from './sceneCommands';
import { canRunOnSelection, selectionFacts } from './selectionNeeds';
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
  const { selection, parts } = inputs.core;
  const facts = selectionFacts(selection.selectedParts, parts);
  const all = [...sceneCommands(inputs), ...editCommands(inputs), ...viewCommands(inputs)].filter((c) =>
    canRunOnSelection(c.id, facts),
  );
  const running = inputs.core.caseRun;
  const commands = running.open ? leavingFirst(all, running) : all;

  return <CommandPalette open onClose={onClose} commands={commands} />;
}

export function WorkspacePalette({ open, inputs, onClose }: WorkspacePaletteProps) {
  if (!open) return null;

  return (
    <ErrorBoundary region="Command Menu" onClose={onClose}>
      <OpenPalette inputs={inputs} onClose={onClose} />
    </ErrorBoundary>
  );
}
