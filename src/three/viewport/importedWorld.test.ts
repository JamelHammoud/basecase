import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportedMeshWorld } from '../../cases/worldImportTypes';
import { ImportedWorldLayer, type ImportedWorldView } from './importedWorld';

const sparkCalls = vi.hoisted(() => ({
  renderers: [] as unknown[],
  meshes: [] as unknown[],
  disposals: 0,
  update: vi.fn(),
}));

vi.mock('@sparkjsdev/spark', async () => {
  const THREE = await import('three');

  return {
    SplatFileType: { PLY: 'ply', SPZ: 'spz' },
    SparkRenderer: class extends THREE.Object3D {
      constructor(options: unknown) {
        super();
        sparkCalls.renderers.push(options);
      }
      dispose() {}
      update = sparkCalls.update;
      renderSize = new THREE.Vector2();
    },
    SplatMesh: class extends THREE.Object3D {
      initialized = Promise.resolve(this);
      constructor(options: unknown) {
        super();
        sparkCalls.meshes.push(options);
      }
      dispose() {
        sparkCalls.disposals++;
      }
    },
  };
});

function world(): ImportedMeshWorld {
  const box = new THREE.BoxGeometry(100, 50, 80);

  return {
    kind: 'mesh',
    name: 'Kitchen',
    transform: { scale: 1000, quaternion: [0, 0, 0, 1], translation: [-20, 30, 50] },
    mesh: {
      positions: box.getAttribute('position').array as Float32Array,
      normals: box.getAttribute('normal').array as Float32Array,
      indices: new Uint32Array(box.index!.array),
      bounds: { min: [-50, -25, -40], max: [50, 25, 40] },
      groups: [{ start: 0, count: box.index!.count, material: 0 }],
      materials: [{ name: 'Walnut', color: [0.2, 0.1, 0.05, 1], roughness: 0.8, metalness: 0 }],
    },
  };
}

const view = (source = world()): ImportedWorldView => ({
  hash: 'kitchen',
  asset: { world: source, pieces: [source.mesh, source.mesh] },
  position: [200, 0, -100],
});

const layers: ImportedWorldLayer[] = [];

function setupLayer() {
  const parent = new THREE.Group();
  const redraw = vi.fn();
  const renderer = {} as THREE.WebGLRenderer;
  const layer = new ImportedWorldLayer(parent, renderer, redraw);

  layers.push(layer);

  return { parent, redraw, renderer, layer };
}

afterEach(() => {
  layers.splice(0).forEach((layer) => layer.dispose());
  sparkCalls.meshes.length = 0;
  sparkCalls.renderers.length = 0;
  sparkCalls.disposals = 0;
  sparkCalls.update.mockReset();
  vi.unstubAllGlobals();
});

it('awaits the Spark sort for a worker capture without starting automatic updates', async () => {
  const scene = new THREE.Scene();
  const renderer = { getDrawingBufferSize: (target: THREE.Vector2) => target.set(640, 480) } as THREE.WebGLRenderer;
  const layer = new ImportedWorldLayer(scene, renderer, () => {}, true);
  const source = world();
  const camera = new THREE.PerspectiveCamera();
  let sorted = false;
  let finish = () => {};

  source.splat = { name: 'Kitchen.ply', format: 'ply', bytes: new Uint8Array([1]), count: 1 };
  sparkCalls.update.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  layers.push(layer);
  await layer.set(view(source));

  const prepared = layer.prepare(scene, camera).then(() => {
    sorted = true;
  });

  await Promise.resolve();
  expect(sorted).toBe(false);
  finish();
  await prepared;
  expect(sorted).toBe(true);
  expect(sparkCalls.update).toHaveBeenCalledWith({ scene, camera });
  expect(sparkCalls.renderers[0]).toMatchObject({ autoUpdate: false, minSortIntervalMs: 0 });
  await layer.prepare(scene, camera);
  expect(sparkCalls.update).toHaveBeenCalledTimes(1);
  camera.position.x = 10;
  await layer.prepare(scene, camera);
  expect(sparkCalls.update).toHaveBeenCalledTimes(2);
  await layer.set({ ...view(source), position: [300, 0, 0] });
  await layer.prepare(scene, camera);
  expect(sparkCalls.update).toHaveBeenCalledTimes(3);
  await layer.prepare(scene, camera, { width: 320, height: 240 });
  expect(sparkCalls.update).toHaveBeenCalledTimes(4);
});

describe('ImportedWorldLayer', () => {
  it('draws the worker mesh with its materials, keeps buffers and moves without rebuilding', async () => {
    const input = view();
    const { parent, layer, redraw } = setupLayer();

    await layer.set(input);

    const mesh = layer.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;

    expect(parent.children).toContain(layer.group);
    expect(mesh.geometry.getAttribute('position').array).toBe(input.asset.world.mesh.positions);
    expect(mesh.geometry.getAttribute('normal').array).toBe(input.asset.world.mesh.normals);
    expect(mesh.material[0].color.toArray()).toEqual([0.2, 0.1, 0.05]);
    expect(mesh.geometry.boundingSphere?.radius).toBeCloseTo(Math.hypot(50, 25, 40));
    expect(layer.state()).toMatchObject({ hash: 'kitchen', splat: false, meshes: 1, pieces: 2, loaded: true });
    await layer.set({ ...input, position: [300, 0, 0] });
    expect(layer.group.children[0]).toBe(mesh);
    expect(layer.group.position.toArray()).toEqual([300, 0, 0]);
    expect(sparkCalls.renderers).toHaveLength(0);
    redraw.mockClear();
    await layer.set({ ...input, position: [300, 0, 0] });
    expect(redraw).not.toHaveBeenCalled();
  });

  it.each([true, false])('keeps embedded texture UV orientation when flipY is %s', async (flipY) => {
    const source = world();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const decode = vi.fn().mockResolvedValue(bitmap);

    source.mesh.materials[0].image = {
      bytes: new Uint8Array([1]),
      mimeType: 'image/png',
      flipY,
      wrapS: 'mirror',
      wrapT: 'clamp',
    };
    vi.stubGlobal('createImageBitmap', decode);

    const { layer } = setupLayer();

    await layer.set(view(source));

    const mesh = layer.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
    const texture = mesh.material[0].map!;
    const disposed = vi.fn();

    texture.addEventListener('dispose', disposed);
    expect(decode.mock.calls[0][1]).toMatchObject({ imageOrientation: flipY ? 'flipY' : 'none' });
    expect(texture.image).toBe(bitmap);
    expect(texture.flipY).toBe(false);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.wrapS).toBe(THREE.MirroredRepeatWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    await layer.set(null);
    expect(disposed).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it.each(['spz', 'ply'] as const)('gives Spark raw %s bytes and applies the collider frame', async (format) => {
    const source = world();
    const bytes = new Uint8Array([1, 2, 3]);
    const { layer, renderer, redraw } = setupLayer();

    source.splat = { name: `Kitchen.${format}`, format, bytes, count: 256 };
    await layer.set(view(source));

    const splat = layer.group.children.find((object) => object.name === 'imported-world-splats')!;
    const options = sparkCalls.meshes[0] as Record<string, unknown>;

    expect(options.fileBytes).toBe(bytes);
    expect(options.fileType).toBe(format);
    expect(options).not.toHaveProperty('url');
    expect(sparkCalls.renderers[0]).toEqual({ renderer, onDirty: redraw, enableLod: false });
    expect(splat.position.toArray()).toEqual(source.transform.translation);
    expect(splat.scale.toArray()).toEqual([1000, 1000, 1000]);
    expect(layer.state()).toMatchObject({ hash: 'kitchen', splat: true, meshes: 0, pieces: 2, loaded: true });
    await layer.set(null);
    expect(layer.group.children).toHaveLength(0);
    expect(sparkCalls.disposals).toBe(1);
  });

  it('drops a texture decode finishing after the Case closes and releases mesh resources', async () => {
    const source = world();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    let finish: (value: ImageBitmap) => void = () => {};

    source.mesh.materials[0].image = { bytes: new Uint8Array([1]), mimeType: 'image/png' };
    vi.stubGlobal('createImageBitmap', () => new Promise<ImageBitmap>((resolve) => (finish = resolve)));

    const { layer } = setupLayer();
    const loading = layer.set(view(source));
    const mesh = layer.group.children[0] as THREE.Mesh;
    const disposed = vi.fn();

    mesh.geometry.addEventListener('dispose', disposed);
    await layer.set(null);
    finish(bitmap);
    await loading;
    expect(disposed).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(layer.state()).toMatchObject({ hash: null, splat: false, meshes: 0, pieces: 0, loaded: false });
  });

  it('releases a world when its embedded texture fails and permits reopening it', async () => {
    const input = view();

    input.asset.world.mesh.materials[0].image = { bytes: new Uint8Array([1]), mimeType: 'image/png' };
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Texture decode failed')));

    const { layer } = setupLayer();

    await expect(layer.set(input)).rejects.toThrow('Texture decode failed');
    expect(layer.group.children).toHaveLength(0);
    expect(layer.state().hash).toBeNull();
    await layer.set(view());
    expect(layer.state().loaded).toBe(true);
  });
});
