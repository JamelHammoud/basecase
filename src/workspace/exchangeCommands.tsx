import type { Command } from '../components/CommandPalette';
import { ClipboardIcon, DownloadIcon, FileImportIcon, FolderOpenIcon, PhotoIcon, ShareIcon } from '../design-system';
import { SHARE_LABEL } from '../utils/os';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export function exchangeCommands({ core, actions }: CommandInputs): Command[] {
  const { studio } = core;
  const { exports, creation } = actions;

  return [
    {
      id: 'open-scene-file',
      group: 'Scene',
      label: 'Open Scene File',
      icon: <FolderOpenIcon className={ic} />,
      keywords: 'import basecase share friend shared received',
      run: () => void studio.openSceneFile(),
    },
    {
      id: 'export-scene',
      group: 'Scene',
      label: 'Export Scene',
      icon: <DownloadIcon className={ic} />,
      keywords: 'share send friend basecase file download save',
      run: () => void exports.exportScene(),
    },
    {
      id: 'copy-brief',
      group: 'Scene',
      label: 'Copy as Markdown',
      icon: <ClipboardIcon className={ic} />,
      keywords: 'markdown clipboard export brief spec',
      run: exports.copyBrief,
    },
    {
      id: 'export',
      group: 'Scene',
      label: 'Export STL',
      icon: <DownloadIcon className={ic} />,
      keywords: 'print download',
      run: exports.exportStl,
    },
    {
      id: 'airdrop',
      group: 'Scene',
      label: SHARE_LABEL,
      icon: <ShareIcon className={ic} />,
      keywords: 'ar augmented reality iphone ipad usdz quick look share send phone',
      run: () => void exports.airDrop(),
    },
    {
      id: 'export-image',
      group: 'Scene',
      label: 'Export Image',
      icon: <PhotoIcon className={ic} />,
      keywords: 'png screenshot render download',
      run: exports.exportImage,
    },
    {
      id: 'import-mesh',
      group: 'Scene',
      label: 'Import Mesh',
      icon: <FileImportIcon className={ic} />,
      keywords: 'stl 3mf obj ply fbx glb gltf dae step stp iges igs cad model file print',
      run: () => void creation.pickMeshes(),
    },
  ];
}
