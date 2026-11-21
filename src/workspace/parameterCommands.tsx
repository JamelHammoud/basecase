import type { Command } from '../components/CommandPalette';
import { RulerIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { WorkspaceCore } from './useWorkspaceCore';

export function parameterCommands(core: WorkspaceCore): Command[] {
  if (IS_WEB_DEMO) return [];

  return [
    {
      id: 'edit-parameters',
      group: 'Scene',
      label: 'Edit Parameters',
      icon: <RulerIcon />,
      keywords: 'dimensions shared expression bind',
      run: () => {
        core.tool.setRightTab('inspector');
        core.studio.setIsRightOpen(true);
        core.parameters.setExpanded(true);
      },
    },
  ];
}
