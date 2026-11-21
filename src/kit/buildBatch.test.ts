import { expect, it, vi } from 'vitest';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { freezeBuildKit } from './frozenKit';
import { kitFixture } from './kit.fixtures';

const designs = [
  'differential rover',
  'SO-101-style arm',
  'quadruped',
  'hexapod',
  'biped',
  'pan-tilt camera',
  'gripper',
  'conveyor mechanism',
  'mixed-servo arm',
  'repeated limb modules',
];

async function prepared(name = designs[0]) {
  const job = kitFixture(name);
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));

  return freezeBuildKit({ job, meshes });
}

const namesFor = (quantity: number) => Array.from({ length: quantity }, (_, i) => `Robot ${i + 1}`);

it.each(designs)('creates one and twenty independent %s builds in one transaction per group', async (name) => {
  const storage = memoryBuildStorage();
  const update = vi.spyOn(storage, 'update');
  const store = createBuildStore(storage);
  const content = await prepared(name);
  const before = JSON.stringify(content);
  const [single] = await store.createMany(['Single'], content);
  const bytes = storage.assetBytes();
  const batch = await store.createMany(namesFor(20), content);

  expect(update).toHaveBeenCalledTimes(2);
  expect(batch.map((record) => record.name)).toEqual(namesFor(20));
  expect(new Set([single.id, ...batch.map((record) => record.id)]).size).toBe(21);
  expect(new Set(batch.map((record) => record.kit))).toEqual(new Set([content.hash]));
  expect(batch.every((record) => record.count === single.count)).toBe(true);
  expect(storage.assetBytes()).toBe(bytes);
  expect(JSON.stringify(content)).toBe(before);

  await store.complete(batch[0].id, 0, true);
  await store.navigate(batch[1].id, 1);

  const reopened = createBuildStore(storage);
  const first = await reopened.open(batch[0].id);
  const second = await reopened.open(batch[1].id);
  const untouched = await reopened.open(single.id);

  expect(first.record.completed).toEqual({ '0': expect.any(String) });
  expect(first.record.index).toBe(0);
  expect(second.record.completed).toEqual({});
  expect(second.record.index).toBe(1);
  expect(untouched.record).toEqual(single);
  expect(first.kit).toEqual(second.kit);
  expect(second.kit).toEqual(untouched.kit);
});

it('refuses an entire group when it would exceed the existing build or byte limit', async () => {
  const storage = memoryBuildStorage();
  const store = createBuildStore(storage, { maxBytes: 256 * 1024 * 1024, maxBuilds: 20 });
  const content = await prepared();
  const [single] = await store.createMany(['Existing'], content);
  const bytes = storage.assetBytes();
  const before = await storage.get('index');

  await expect(store.createMany(namesFor(20), content)).rejects.toThrow('storage is full');
  expect(await storage.get('index')).toEqual(before);
  expect(await store.list()).toEqual([expect.objectContaining({ id: single.id })]);
  expect(storage.assetBytes()).toBe(bytes);

  const other = memoryBuildStorage();
  const limited = createBuildStore(other, { maxBytes: bytes - 1, maxBuilds: 100 });

  await expect(limited.createMany(namesFor(20), content)).rejects.toThrow('storage is full');
  expect(await limited.list()).toEqual([]);
  expect(other.assetBytes()).toBe(0);
});

it('allows only one concurrent group to claim the last twenty build slots', async () => {
  const storage = memoryBuildStorage();
  const limits = { maxBytes: 256 * 1024 * 1024, maxBuilds: 21 };
  const store = createBuildStore(storage, limits);
  const other = createBuildStore(storage, limits);
  const content = await prepared();

  await store.create('Existing', content);

  const results = await Promise.allSettled([
    store.createMany(namesFor(20), content),
    other.createMany(namesFor(20), content),
  ]);

  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(await store.list()).toHaveLength(21);
});

it.each([0, 21])('refuses a group of %i without reading or writing storage', async (quantity) => {
  const storage = memoryBuildStorage();
  const update = vi.spyOn(storage, 'update');
  const store = createBuildStore(storage);

  await expect(store.createMany(namesFor(quantity), await prepared())).rejects.toThrow('1 to 20');
  expect(update).not.toHaveBeenCalled();
  expect(await store.list()).toEqual([]);
});

it('leaves no records or assets after interrupted or cancelled group publication', async () => {
  const storage = memoryBuildStorage();
  const store = createBuildStore(storage);
  const content = await prepared();

  storage.interrupt();
  await expect(store.createMany(namesFor(20), content)).rejects.toThrow('Interrupted');
  expect(await store.list()).toEqual([]);
  expect(storage.assetBytes()).toBe(0);
  await expect(store.createMany(namesFor(20), content, AbortSignal.abort())).rejects.toThrow();
  expect(await store.list()).toEqual([]);
  expect(storage.assetBytes()).toBe(0);
});

it('captures the requested names before asynchronous preparation', async () => {
  const storage = memoryBuildStorage();
  const store = createBuildStore(storage);
  const names = ['First', 'Second'];
  const pending = store.createMany(names, await prepared());

  names.splice(0, names.length, ...namesFor(21));

  expect((await pending).map((record) => record.name)).toEqual(['First', 'Second']);
});

it('aborts a group cancelled at the transaction boundary without changing unrelated builds', async () => {
  const storage = memoryBuildStorage();
  const store = createBuildStore(storage);
  const content = await prepared();
  const existing = await store.create('Existing', content);
  const index = await storage.get('index');
  const abort = new AbortController();
  const update = storage.update;

  vi.spyOn(storage, 'update').mockImplementation((keys, change) => {
    abort.abort();

    return update(keys, change);
  });

  await expect(store.createMany(namesFor(20), content, abort.signal)).rejects.toThrow();
  expect(await storage.get('index')).toEqual(index);
  expect((await store.open(existing.id)).record).toEqual(existing);
});
