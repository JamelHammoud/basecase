import type { Command } from '../components/CommandPalette';
import {
  ClipboardIcon,
  DownloadIcon,
  FileIcon,
  FileImportIcon,
  FolderOpenIcon,
  PhotoIcon,
  RobotsIcon,
  ShareIcon,
} from '../design-system';
import { SHARE_LABEL } from '../utils/os';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export function exchangeCommands({ core, actions }: CommandInputs): Command[] {
  const { studio } = core;
  const { exports, files } = actions;
  const robotPackage: Command = {
    id: 'export-robot-package',
    group: 'Scene',
    label: 'Export Robot Package',
    icon: <RobotsIcon className={ic} />,
    keywords: 'mujoco mjcf urdf ros lerobot joint map policy zip download',
    run: () => void exports.exportRobotPackage(),
  };

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
      icon: <FileIcon className={ic} />,
      keywords: 'share send friend basecase file download save',
      run: () => void exports.exportScene(),
    },
    ...(exports.canExportRobot ? [robotPackage] : []),
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
      id: 'import',
      group: 'Scene',
      label: 'Import',
      icon: <FileImportIcon className={ic} />,
      keywords:
        'file mesh stl 3mf obj ply fbx glb gltf dae step stp iges igs cad model print svg extrude urdf mjcf zip robot bvh mocap motion image png jpg',
      run: () => void files.pickImports(),
    },
  ];
}
