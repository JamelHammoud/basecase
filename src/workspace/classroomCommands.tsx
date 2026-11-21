import type { Command } from '../components/CommandPalette';
import { CasesIcon, DownloadIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { exportClassroom, openClassroom } from './classroomActions';
import type { WorkspaceCore } from './useWorkspaceCore';

export function classroomCommands(core: WorkspaceCore): Command[] {
  if (!IS_WEB_DEMO) return [];

  const commands: Command[] = [
    {
      id: 'classroom',
      group: 'Simulate',
      label: 'Classroom',
      keywords: 'assignment import grade submissions class',
      icon: <CasesIcon />,
      run: openClassroom,
    },
  ];

  if (core.simTraining.cases.active && core.parts.length)
    commands.push({
      id: 'export-assignment',
      group: 'Simulate',
      label: 'Export Assignment',
      icon: <DownloadIcon />,
      run: () => void exportClassroom(core),
    });

  if (core.project.assignment)
    commands.push({
      id: 'submit',
      group: 'Simulate',
      label: 'Submit',
      icon: <DownloadIcon />,
      run: () => void exportClassroom(core, true),
    });

  return commands;
}
