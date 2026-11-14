import { describe, expect, it, vi } from 'vitest';
import { hasWorldFile, readDroppedWorld } from './worldImport';
import { importWorldInWorker } from '../cases/worldImportClient';
import { MAX_WORLD_BYTES } from '../cases/worldImport/limits';

vi.mock('../cases/worldImportClient', () => ({ importWorldInWorker: vi.fn(async (request) => request) }));

describe('world drop batches', () => {
  it('keeps the mesh, splat and glTF resources in one worker request', async () => {
    const names = ['kitchen.gltf', 'kitchen.bin', 'kitchen.spz', 'floor.png'];
    const files = names.map((name) => new File([name], name));

    await readDroppedWorld(files);

    expect(importWorldInWorker).toHaveBeenLastCalledWith({
      files: names.map((name) => ({ name, bytes: new TextEncoder().encode(name) })),
    });
    expect(hasWorldFile(files)).toBe(true);
    expect(hasWorldFile([new File([], 'capture.PLY')])).toBe(true);
    expect(hasWorldFile([new File([], 'robot.urdf'), new File([], 'part.stl')])).toBe(false);
  });

  it('refuses an oversized batch before reading any bytes', async () => {
    const arrayBuffer = vi.fn();
    const file = { name: 'world.glb', size: MAX_WORLD_BYTES + 1, arrayBuffer } as unknown as File;

    await expect(readDroppedWorld([file])).rejects.toThrow(/64 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
