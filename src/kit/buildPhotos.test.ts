import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createBuildStore } from './buildRecords';
import { createBuildPhotos } from './buildPhotos';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { kitFixture } from './kit.fixtures';
import { freezeBuildKit } from './frozenKit';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { prepareBuildPhoto, verifyBuildPhoto } from './photoImage';
import { generatedPhoto, installPhotoDecoder } from './photoImage.fixtures';

beforeEach(installPhotoDecoder);
afterEach(() => vi.unstubAllGlobals());

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

async function fixture(name = designs[0]) {
  const job = kitFixture(name);
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const content = await freezeBuildKit({ job, meshes });
  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const photos = createBuildPhotos(storage);

  return { job, content, storage, builds, photos };
}

it.each(designs)('retains exact photograph identities for one and twenty %s builds', async (name) => {
  const { job, content, storage, builds, photos } = await fixture(name);
  const single = await builds.create('One', content);
  const others = await builds.createMany(
    Array.from({ length: 20 }, (_, i) => `Robot ${i}`),
    content,
  );
  const photo = await prepareBuildPhoto(await generatedPhoto());
  const original = JSON.stringify(content);
  const first = { build: single.id, kit: single.kit, step: 0 };
  const frozenIndex = await storage.get('index');

  await photos.attach(first, photo);
  await Promise.all(others.map((record) => photos.attach({ build: record.id, kit: record.kit, step: 0 }, photo)));
  await photos.attach({ ...first, step: 1 }, photo);
  await photos.attach(first, photo);
  expect(await storage.get('index')).toEqual(frozenIndex);
  expect((await builds.open(single.id)).record).toEqual(single);
  await builds.complete(single.id, 0, true);
  await builds.complete(single.id, 0, false);
  job.parts[0] = { ...job.parts[0], name: 'Edited source' };

  const reopened = createBuildPhotos(storage);
  const observations = await reopened.list(first);
  const stored = await reopened.image(observations[0].hash);

  expect(observations).toHaveLength(1);
  expect(observations[0]).toMatchObject(first);
  expect(
    createHash('sha256')
      .update(new Uint8Array(await stored.original.arrayBuffer()))
      .digest('hex'),
  ).toBe(photo.hash);
  expect((await reopened.list({ ...first, step: 1 }))[0]).toMatchObject({ ...first, step: 1 });
  expect(((await storage.get('observations')) as { records: unknown[] }).records).toHaveLength(22);
  expect((await builds.open(single.id)).record.completed).toEqual({});
  expect((await builds.open(others[0].id)).record).toEqual(others[0]);
  expect(JSON.stringify(content)).toBe(original);
  await verifyBuildPhoto(stored);
  await photos.remove(observations[0].id);
  await builds.remove(single.id);
  expect(await photos.list(first)).toEqual([]);
  expect((await photos.image(photo.hash)).hash).toBe(photo.hash);

  for (const other of others) await builds.remove(other.id);

  expect(await storage.get(`photo:${photo.hash}`)).toBeUndefined();
});

it('commits concurrent photos, refuses wrong destinations and leaves interrupted or cancelled writes invisible', async () => {
  const { storage, content, builds, photos } = await fixture();
  const a = await builds.create('A', content);
  const b = await builds.create('B', content);
  const destination = { build: a.id, kit: a.kit, step: 0 };
  const one = await prepareBuildPhoto(await generatedPhoto());
  const two = await prepareBuildPhoto(await generatedPhoto(2));

  await Promise.all([photos.attach(destination, one), photos.attach(destination, two)]);
  expect(await photos.list(destination)).toHaveLength(2);
  expect(await photos.list({ ...destination, build: b.id })).toEqual([]);
  await expect(photos.attach({ ...destination, kit: 'a'.repeat(64) }, one)).rejects.toThrow();
  await expect(photos.attach({ ...destination, step: a.count }, one)).rejects.toThrow();
  storage.interrupt();
  await expect(photos.attach({ ...destination, step: 1 }, one)).rejects.toThrow();
  await expect(photos.attach({ ...destination, step: 1 }, one, AbortSignal.abort())).rejects.toThrow();
  expect(await photos.list({ ...destination, step: 1 })).toEqual([]);
  expect((await builds.open(a.id)).record).toEqual(a);
  expect((await builds.open(b.id)).record).toEqual(b);
});

it('refuses observation byte and association limits independently of existing Kit storage', async () => {
  const { storage, content, builds } = await fixture();
  const a = await builds.create('A', content);
  const destination = { build: a.id, kit: a.kit, step: 0 };
  const photo = await prepareBuildPhoto(await generatedPhoto());
  const photos = createBuildPhotos(storage, { maxBytes: photo.bytes - 1, maxPhotos: 2, perStep: 2 });

  await expect(photos.attach(destination, photo)).rejects.toThrow();
  expect(await photos.list(destination)).toEqual([]);
  expect(await storage.get(`photo:${photo.hash}`)).toBeUndefined();
  expect((await builds.open(a.id)).record).toEqual(a);
});

it('captures destination and bounded metadata before asynchronous hashing', async () => {
  const { content, builds, photos } = await fixture();
  const a = await builds.create('A', content);
  const b = await builds.create('B', content);
  const destination = { build: a.id, kit: a.kit, step: 0 };
  const metadata = { name: '../\u0000bracket\u202e.png' + 'x'.repeat(150), modified: 1 };
  const photo = await prepareBuildPhoto(await generatedPhoto());
  const pending = photos.attach(destination, photo, undefined, metadata);

  destination.build = b.id;
  destination.step = 1;
  metadata.name = 'changed';
  metadata.modified = Date.now();

  const saved = await pending;

  expect(saved).toMatchObject({ build: a.id, kit: a.kit, step: 0, suppliedModifiedAt: '1970-01-01T00:00:00.001Z' });
  expect(saved.name).toHaveLength(120);
  expect(saved.name).not.toMatch(/[\u202e/]/);
  expect(saved.importedAt).not.toBe(saved.suppliedModifiedAt);
  expect(await photos.list(destination)).toEqual([]);
});

it('refuses per-step and total association overflow and preserves images after failed deletion', async () => {
  const { storage, content, builds } = await fixture();
  const a = await builds.create('A', content);
  const photos = createBuildPhotos(storage, { maxBytes: 1000000, maxPhotos: 2, perStep: 1 });
  const destination = { build: a.id, kit: a.kit, step: 0 };
  const one = await prepareBuildPhoto(await generatedPhoto());
  const two = await prepareBuildPhoto(await generatedPhoto(2));
  const saved = await photos.attach(destination, one);

  await expect(photos.attach(destination, two)).rejects.toThrow('storage is full');
  await photos.attach({ ...destination, step: 1 }, two);
  await expect(photos.attach({ ...destination, step: 2 }, one)).rejects.toThrow('storage is full');
  storage.interrupt();
  await expect(photos.remove(saved.id)).rejects.toThrow();
  expect(await photos.list(destination)).toEqual([saved]);
  storage.interrupt();
  await expect(builds.remove(a.id)).rejects.toThrow();
  expect(await photos.list(destination)).toEqual([saved]);
  expect((await photos.image(one.hash)).hash).toBe(one.hash);
});

it('refuses a delayed import after its build was deleted and cancellation at the commit boundary', async () => {
  const { storage, content, builds, photos } = await fixture();
  const a = await builds.create('A', content);
  const destination = { build: a.id, kit: a.kit, step: 0 };
  const photo = await prepareBuildPhoto(await generatedPhoto());

  await builds.remove(a.id);
  await expect(photos.attach(destination, photo)).rejects.toThrow();
  expect(await storage.get(`photo:${photo.hash}`)).toBeUndefined();

  const b = await builds.create('B', content);
  const abort = new AbortController();
  const update = storage.update;

  vi.spyOn(storage, 'update').mockImplementation((keys, change) => {
    abort.abort();

    return update(keys, change);
  });
  await expect(photos.attach({ ...destination, build: b.id }, photo, abort.signal)).rejects.toThrow();
  expect(await storage.get(`photo:${photo.hash}`)).toBeUndefined();
});

it('refuses valid image bytes stored under a different association hash', async () => {
  const { storage, content, builds, photos } = await fixture();
  const build = await builds.create('A', content);
  const image = await prepareBuildPhoto(await generatedPhoto());
  const different = await prepareBuildPhoto(await generatedPhoto(2));
  const destination = { build: build.id, kit: build.kit, step: 0 };

  await photos.attach(destination, image);
  await storage.update([], () => ({ puts: { [`photo:${image.hash}`]: different }, result: undefined }));
  await expect(photos.image(image.hash)).rejects.toThrow();
  expect((await photos.list(destination))[0].hash).toBe(image.hash);
});
