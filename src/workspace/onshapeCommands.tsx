import type { Command } from '../components/CommandPalette';
import { RefreshIcon } from '../design-system';
import { onshapeTarget } from '../onshape/onshapeTarget';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

export function onshapeCommands({ core, actions }: CommandInputs): Command[] {
  const target = IS_WEB_DEMO ? null : onshapeTarget(core.parts, core.selectedIds);

  if (!target) return [];

  return [
    {
      id: 'update-from-onshape',
      group: 'Scene',
      label: 'Update from Onshape',
      icon: <RefreshIcon className="w-4 h-4" />,
      keywords: `onshape refresh reload sync cad assembly ${target.group.name}`,
      run: () => void actions.onshape.update(target.group.id),
    },
  ];
}
