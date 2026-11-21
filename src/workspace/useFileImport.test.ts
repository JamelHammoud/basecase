import { describe, expect, it, vi } from 'vitest';
import { useFileImport } from './useFileImport';
import { dataSourceOf } from './dataImportSource';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { DataImport } from './useDataImport';
import type { PartCreation } from './usePartCreation';
import type { PoseActions } from './usePoseActions';

describe('picking image datasets through Import', () => {
  it('routes a picked COCO folder as one dataset before PNG reference images and JSON unknown files', async () => {
    const importOrRobot = vi.fn();
    const addImagePlane = vi.fn();
    const showToast = vi.fn();
    const core = { tool: {}, studio: {}, showToast } as unknown as WorkspaceCore;
    const importer = useFileImport(core, {
      creation: { addImagePlane } as unknown as PartCreation,
      pose: {} as PoseActions,
      data: { importOrRobot } as unknown as DataImport,
    });
    const files = ['mugs/train/_annotations.coco.json', 'mugs/train/one.png'].map((name) => new File(['x'], name));

    importer.importFiles({ files });
    expect(importOrRobot).toHaveBeenCalledOnce();
    expect(addImagePlane).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();

    const [source] = importOrRobot.mock.calls[0];
    const data = await dataSourceOf(source);

    expect(data?.name).toBe('mugs');
    expect(data?.kind).toBe('files');

    if (data?.kind !== 'files') throw new Error('The fixture was not routed as dataset files.');

    expect(data.files.map((file) => file.path)).toEqual(files.map((file) => file.name));
  });
  it('imports model folders and their relative buffers without opening the robot importer', () => {
    const importMeshes = vi.fn();
    const importOrRobot = vi.fn();
    const showToast = vi.fn();
    const core = { tool: {}, studio: {}, showToast } as unknown as WorkspaceCore;
    const importer = useFileImport(core, {
      creation: { importMeshes } as unknown as PartCreation,
      pose: {} as PoseActions,
      data: { importOrRobot } as unknown as DataImport,
    });
    const folder = {
      name: 'model',
      files: ['model/assembly.gltf', 'model/buffers/mesh.bin'].map((path) => ({ path, blob: new Blob(['fixture']) })),
    };

    importer.importFiles({ files: [], folders: [folder] });
    expect(importMeshes).toHaveBeenCalledOnce();
    expect(importMeshes.mock.calls[0][0].map((file: File) => file.name)).toEqual(['model/assembly.gltf']);
    expect(importMeshes.mock.calls[0][2].map((file: File) => file.name)).toEqual(['model/buffers/mesh.bin']);
    expect(importOrRobot).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
