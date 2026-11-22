import { expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
} from 'three';
import { localTriangles } from '../meshMeasure';
import { triangleSnapshots } from '../triangleSnapshots';
import { cachedLocalOutputPoint, cachedLocalTriangles, prepareLocalTriangles } from './localTriangleCache';
import { outputLine } from '../analysis/rotorSplit';

const worker = vi.hoisted(() => ({ run: vi.fn(), wait: Promise.resolve() }));

vi.mock('../geometryWorker', () => ({
  geometryWorker: {
    call: async (kind: string, input: Parameters<typeof triangleSnapshots>[0]) => {
      worker.run(kind, input);
      await worker.wait;

      return triangleSnapshots(input);
    },
  },
}));

it('prepares exact local triangles in the worker while copying each shared geometry once', async () => {
  const geometry = new BoxGeometry(20, 30, 40);
  const roots = Array.from({ length: 12 }, (_, index) => {
    const root = new Group();
    const mesh = new Mesh(geometry);

    root.position.set(index * 1.25, 12, -13);
    root.rotation.set(0.2, index / 7, 0.4);
    root.scale.set(1.2, 0.8, -2);
    mesh.position.set(1, 2, 3);
    mesh.rotation.set(0.3, 0.1, 0.2);
    root.add(mesh);

    return root;
  });
  const expected = roots.map(localTriangles);
  const reads = vi.spyOn(geometry.attributes.position, 'getX');

  worker.run.mockClear();
  await prepareLocalTriangles(roots, () => true);
  expect(reads).not.toHaveBeenCalled();
  expect(worker.run.mock.calls[0][1].geometries).toHaveLength(1);

  for (const [index, root] of roots.entries()) expect(cachedLocalTriangles(root)).toEqual(expected[index]);

  expect(reads).not.toHaveBeenCalled();
  await prepareLocalTriangles(roots, () => true);
  expect(worker.run).toHaveBeenCalledOnce();
  reads.mockRestore();
});

it.each([false, true])(
  'refuses stale geometry with current source %s and retains edited interleaved output',
  async (current) => {
    const geometry = new BoxGeometry();
    const data = new InterleavedBuffer(new Float32Array([0, 0, 0, 8, 1, 0, 0, 8, 0, 1, 0, 8]), 4);

    geometry.setAttribute('position', new InterleavedBufferAttribute(data, 3, 0));
    geometry.setIndex([0, 1, 2]);

    const root = new Group().add(new Mesh(geometry));
    let release = () => {};

    worker.wait = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = prepareLocalTriangles([root], () => current);

    data.set([0, 0, 0, 8, 5, 0, 0, 8, 0, 5, 0, 8]);
    data.needsUpdate = true;
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
    worker.wait = Promise.resolve();
  },
);

it('preserves attribute precision, normalized values and interleaved layouts in worker snapshots', async () => {
  const attributes = [
    new BufferAttribute(new Float64Array([0.123456789, 2, 3, 4, 5.87654321, 6, 7, 8, 9]), 3),
    new BufferAttribute(new Uint16Array([123, 456, 789, 65535, 7, 24, 524, 134, 36]), 3, true),
    new InterleavedBufferAttribute(
      new InterleavedBuffer(new Float64Array([8, 0.123456789, 2, 3, 8, 4, 5.87654321, 6, 8, 7, 8, 9]), 4),
      3,
      1,
    ),
  ];
  const roots = attributes.map((position) => {
    const geometry = new BufferGeometry().setAttribute('position', position);
    const root = new Group().add(new Mesh(geometry));

    root.position.set(1000.123, -23.456, 789.012);
    root.rotation.set(0.123, 0.456, 0.789);

    return root;
  });
  const expected = roots.map(localTriangles);

  await prepareLocalTriangles(roots, () => true);

  for (const [index, root] of roots.entries()) expect(cachedLocalTriangles(root)).toEqual(expected[index]);
});

it('accepts an unchanged local mesh while its presentation moves during worker preparation', async () => {
  const root = new Group().add(new Group().add(new Mesh(new BoxGeometry(20, 30, 40))));
  const stationary = new Group().add(new Mesh(new BoxGeometry(10, 20, 30)));
  let release = () => {};

  worker.run.mockClear();
  worker.wait = new Promise<void>((resolve) => {
    release = resolve;
  });

  const pending = prepareLocalTriangles([root, stationary], () => true);

  root.position.set(31, 42, 53);
  root.rotation.set(0.2, 0.3, 0.4);
  root.scale.set(1.1, 1.2, 1.3);
  release();
  await pending;
  expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
  expect(worker.run).toHaveBeenCalledTimes(2);
  expect(worker.run.mock.calls[1][1].sources).toHaveLength(1);
  worker.wait = Promise.resolve();
});

it('refuses a changed descendant transform while preparing an unchanged scene', async () => {
  const child = new Group().add(new Mesh(new BoxGeometry(20, 30, 40)));
  const root = new Group().add(child);
  let release = () => {};

  worker.wait = new Promise<void>((resolve) => {
    release = resolve;
  });

  const pending = prepareLocalTriangles([root], () => true);

  child.position.x = 4;
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  worker.wait = Promise.resolve();
});

it('retains worker-prepared output points with triangle identity and returns owned vectors after geometry edits', async () => {
  const geometry = new BoxGeometry(20, 30, 40);
  const root = new Group().add(new Mesh(geometry));
  const expected = outputLine(localTriangles(root)).start;

  await prepareLocalTriangles([root], () => true);

  const read = vi.spyOn(geometry.attributes.position, 'getY');
  const point = cachedLocalOutputPoint(root);

  expect(point).toEqual(expected);
  point?.set(100, 200, 300);
  expect(cachedLocalOutputPoint(root)).toEqual(expected);
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
  geometry.translate(7, 8, 9);

  const next = outputLine(localTriangles(root)).start;

  await prepareLocalTriangles([root], () => true);
  expect(cachedLocalOutputPoint(root)).toEqual(next);
  expect(next).not.toEqual(expected);
  expect(cachedLocalOutputPoint(new Group())).toBeNull();
});

it('shares exact repeated snapshot buffers internally while keeping public reads independent and near geometry distinct', async () => {
  const geometry = new BoxGeometry(20, 30, 40);
  const roots = [0, 100, 200].map((x) => {
    const root = new Group().add(new Mesh(geometry));

    root.position.x = x;

    return root;
  });

  roots[2].children[0].position.x = 0.00001;
  await prepareLocalTriangles(roots, () => true);

  const input = worker.run.mock.calls.at(-1)![1];
  const result = triangleSnapshots(input);
  const before = cachedLocalTriangles(roots[1]);
  const owned = cachedLocalTriangles(roots[0]);

  expect(result[0].triangles).toBe(result[1].triangles);
  expect(result[2].triangles).not.toBe(result[0].triangles);
  expect(result[2].triangles).not.toEqual(result[0].triangles);
  owned.fill(999);
  expect(cachedLocalTriangles(roots[1])).toEqual(before);
  expect(cachedLocalTriangles(roots[0])).toEqual(before);
});
