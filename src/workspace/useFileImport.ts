import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { pickFiles } from '../utils/pickFiles';
import type { LocalFile } from '../utils/robotImport';
import { couldntImport, importAccept, routeImports } from './importRoute';
import type { PartCreation } from './usePartCreation';
import type { PoseActions } from './usePoseActions';
import type { RobotInsert } from './useRobotInsert';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

const OPTIONS = { cad: !IS_WEB_DEMO };
const IMAGE_STEP = 16;

export interface FileImport {
  files: File[];
  at?: Vec3 | null;
  folders?: { name: string; files: LocalFile[] }[];
}

interface FileImportActions {
  creation: PartCreation;
  robots: RobotInsert;
  pose: PoseActions;
}

export function useFileImport(core: WorkspaceCore, { creation, robots, pose }: FileImportActions) {
  'use memo';

  const { tool, studio, showToast } = core;

  const openRobot = (files: File[], at: Vec3 | undefined, folders: NonNullable<FileImport['folders']>) => {
    const name = [...folders.map((f) => f.name), ...files.map((f) => f.name)].join(', ');
    const local = [...folders.flatMap((f) => f.files), ...files.map((blob) => ({ path: blob.name, blob }))];

    robots.openRobotFiles({ name, files: local, at });
  };

  const openSvg = async (file: File) => tool.openCreator('svg', { name: file.name, text: await file.text() });

  const importFiles = ({ files, at, folders = [] }: FileImport) => {
    const robotFiles: File[] = [];

    routeImports(
      files,
      {
        parts: (parts) => void creation.importMeshes(parts, at),
        svg: (file) => void openSvg(file),
        robot: (picked) => robotFiles.push(...picked),
        motion: pose.importMotionFile,
        scene: (file) => void studio.importSceneFile(file),
        image: (file, i) =>
          void creation.addImagePlane(file, file.name, at ? [at[0] + i * IMAGE_STEP, 0, at[2]] : null),
        unknown: (unknown) => showToast(couldntImport(unknown), { tone: 'error' }),
      },
      OPTIONS,
    );

    if (robotFiles.length || folders.length) openRobot(robotFiles, at ?? undefined, folders);
  };

  const pickImports = async (at?: Vec3 | null) =>
    importFiles({ files: await pickFiles(importAccept(OPTIONS), true), at });

  return { importFiles, pickImports };
}
