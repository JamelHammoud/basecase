import type { Command } from '../components/CommandPalette';
import { PenIcon } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export function sketchSupportCommands(core: WorkspaceCore): Command[] {
  const part = core.selection.selectedPart;

  if (!part?.sketch?.support) return [];

  return [
    {
      id: 'select-sketch-face',
      group: 'Scene',
      label: 'Select Face',
      icon: <PenIcon />,
      keywords: 'sketch support replace resolve attach',
      run: () => core.sketching.selectSupport(part.id),
    },
  ];
}
