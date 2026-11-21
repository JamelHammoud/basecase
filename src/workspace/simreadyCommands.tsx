import type { Command } from '../components/CommandPalette';
import { DownloadIcon } from '../design-system';
import { validSimReadyFields } from '../simready/validation';
import { downloadSimReadyVisual, type SimReadyVisualStatus } from '../three/simreadyVisuals';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

export function simreadyCommands({ core }: CommandInputs, status: SimReadyVisualStatus): Command[] {
  const [part, ...others] = core.selection.selectedParts;

  if (IS_WEB_DEMO || !part?.mesh?.visual || others.length || !validSimReadyFields(part)) return [];

  if (status === 'ready' || status === 'loading') return [];

  return [
    {
      id: 'download-simready-textures',
      group: 'Selection',
      label: 'Download Textures',
      icon: <DownloadIcon />,
      keywords: 'simready materials visual',
      run: () => void downloadSimReadyVisual(part),
    },
  ];
}
