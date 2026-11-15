import { describe, expect, it, vi } from 'vitest';
import { readDroppedWorld, splitWorldDrop } from './worldImport';
import { importWorldInWorker } from '../cases/worldImportClient';
import { MAX_WORLD_BYTES } from '../cases/worldImport/limits';

vi.mock('../cases/worldImportClient', () => ({ importWorldInWorker: vi.fn(async (request) => request) }));

describe('world drop batches', () => {
  it('keeps RoomPlan drops separate from unrelated files while batching mesh resources together', () => {
    const room = new File([], 'kitchen.json');
    const second = new File([], 'bedroom.json');
    const image = new File([], 'photo.png');
    const mesh = new File([], 'kitchen.gltf');
    const buffer = new File([], 'kitchen.bin');

    expect(splitWorldDrop([room, second, image])).toEqual({
      worlds: [[room], [second]],
      remaining: [image],
      worldFolders: false,
    });
    expect(splitWorldDrop([mesh, buffer, image])).toEqual({
      worlds: [[mesh, buffer, image]],
      remaining: [],
      worldFolders: true,
    });
  });

  it.each(['robot.urdf', 'scene.basecase', 'motion.bvh', 'recording.mcap', 'dataset.zip'])(
    'keeps %s on its existing import route alongside JSON or mesh resources',
    (name) => {
      const files = [new File([], name), new File([], 'metadata.json'), new File([], 'part.glb')];

      expect(splitWorldDrop(files)).toEqual({ worlds: [], remaining: files, worldFolders: false });
    },
  );

  it('keeps the mesh, splat and glTF resources in one worker request', async () => {
    const names = ['kitchen.gltf', 'kitchen.bin', 'kitchen.spz', 'floor.png'];
    const files = names.map((name) => new File([name], name));

    await readDroppedWorld(files);

    expect(importWorldInWorker).toHaveBeenLastCalledWith({
      files: names.map((name) => ({ name, bytes: new TextEncoder().encode(name) })),
    });
    expect(splitWorldDrop(files).worlds).toEqual([files]);
    expect(splitWorldDrop([new File([], 'capture.PLY')]).worlds).toHaveLength(1);
    expect(splitWorldDrop([new File([], 'robot.urdf'), new File([], 'part.stl')]).worlds).toEqual([]);
  });

  it('refuses an oversized batch before reading any bytes', async () => {
    const arrayBuffer = vi.fn();
    const file = { name: 'world.glb', size: MAX_WORLD_BYTES + 1, arrayBuffer } as unknown as File;

    await expect(readDroppedWorld([file])).rejects.toThrow(/64 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('preserves linked resources in accompanying folders and includes them in the byte cap', async () => {
    const mesh = new File(['mesh'], 'kitchen.gltf');
    const texture = new File(['pixels'], 'floor.png');
    const folders = [{ name: 'textures', files: [{ path: 'textures/floor.png', blob: texture }] }];

    await readDroppedWorld([mesh], folders);

    expect(importWorldInWorker).toHaveBeenLastCalledWith({
      files: [
        { name: 'kitchen.gltf', bytes: new TextEncoder().encode('mesh') },
        { name: 'textures/floor.png', bytes: new TextEncoder().encode('pixels') },
      ],
    });

    const arrayBuffer = vi.fn();
    const oversized = { size: MAX_WORLD_BYTES, arrayBuffer } as unknown as File;

    await expect(
      readDroppedWorld([mesh], [{ name: 'textures', files: [{ path: 'textures/floor.png', blob: oversized }] }]),
    ).rejects.toThrow(/64 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
