import type { Command } from '../components/CommandPalette';
import {
  ClipboardIcon,
  DownloadIcon,
  FileIcon,
  FileImportIcon,
  FolderOpenIcon,
  PhotoIcon,
  RobotsIcon,
  ShapeIcon,
  ShareIcon,
} from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { SHARE_LABEL } from '../utils/os';
import type { CommandInputs } from './sceneCommands';

export function exchangeCommands({ core, actions }: CommandInputs): Command[] {
  const { studio } = core;
  const { exports, files } = actions;
  const robotPackage: Command = {
    id: 'export-robot-package',
    group: 'Scene',
    label: 'Export Robot Package',
    icon: <RobotsIcon />,
    keywords: 'mujoco mjcf urdf ros lerobot joint map policy zip download',
    run: () => void exports.exportRobotPackage(),
  };
  const stepExport: Command = {
    id: 'export-step',
    group: 'Scene',
    label: 'Export STEP',
    icon: <ShapeIcon />,
    keywords: 'stp cad assembly fusion onshape solidworks freecad download',
    run: () => void exports.exportStep(),
  };
  const partExports: Command[] = [
    {
      id: 'export',
      group: 'Scene',
      label: 'Export STL',
      icon: <DownloadIcon />,
      keywords: 'print download',
      run: exports.exportStl,
    },
    {
      id: 'airdrop',
      group: 'Scene',
      label: SHARE_LABEL,
      icon: <ShareIcon />,
      keywords: 'ar augmented reality iphone ipad usdz quick look share send phone',
      run: () => void exports.airDrop(),
    },
  ];

  return [
    {
      id: 'open-scene-file',
      group: 'Scene',
      label: 'Open Scene File',
      icon: <FolderOpenIcon />,
      keywords: 'import basecase share friend shared received',
      run: () => void studio.openSceneFile(),
    },
    {
      id: 'export-scene',
      group: 'Scene',
      label: 'Export Scene',
      icon: <FileIcon />,
      keywords: 'share send friend basecase file download save',
      run: () => void exports.exportScene(),
    },
    ...(exports.canExportRobot ? [robotPackage] : []),
    {
      id: 'copy-brief',
      group: 'Scene',
      label: 'Copy as Markdown',
      icon: <ClipboardIcon />,
      keywords: 'markdown clipboard export brief spec',
      run: exports.copyBrief,
    },
    ...(exports.canExportParts ? partExports : []),
    ...(IS_WEB_DEMO || !exports.canExportStep ? [] : [stepExport]),
    {
      id: 'export-image',
      group: 'Scene',
      label: 'Export Image',
      icon: <PhotoIcon />,
      keywords: 'png screenshot render download',
      run: exports.exportImage,
    },
    {
      id: 'import',
      group: 'Scene',
      label: 'Import',
      icon: <FileImportIcon />,
      keywords:
        'file mesh stl 3mf obj ply fbx glb gltf dae step stp iges igs cad model print svg extrude urdf mjcf zip robot bvh mocap motion image png jpg',
      run: () => void files.pickImports(),
    },
  ];
}
