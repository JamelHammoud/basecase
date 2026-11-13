import type { Command } from '../components/CommandPalette';
import { PackageIcon } from '../design-system';
import { isBuilt } from '../guide/guidePlan';
import type { CommandInputs } from './sceneCommands';

export function buildCommands({ core }: CommandInputs): Command[] {
  if (!core.parts.some(isBuilt)) return [];

  return [
    {
      id: 'build-along',
      group: 'Scene',
      label: 'Build Along',
      icon: <PackageIcon className="w-4 h-4" />,
      keywords: 'build guide assembly instructions steps servo bus ids assemble kit',
      run: () => void core.buildAlong.open(),
    },
  ];
}
