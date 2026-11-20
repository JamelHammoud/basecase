import { describe, expect, it } from 'vitest';
import { buildAlongSteps } from '../guide/buildAlong';
import { kitFixture } from './kit.fixtures';
import { createBuildStore } from './buildRecords';
import { freezeBuildKit, readFrozenKit, frozenKitContent } from './frozenKit';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { memoryBuildStorage } from './buildStorage.fixtures';

async function prepared(name?: string) {
  const job = kitFixture(name);
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const kit = await freezeBuildKit({ job, meshes });

  return { job, kit };
}

describe('independent frozen builds', () => {
  it('retains independent completion and navigation across reopening and source edits', async () => {
    const storage = memoryBuildStorage();
    const store = createBuildStore(storage);
    const { job, kit } = await prepared();
    const first = await store.create('Arm one', kit);
    const second = await store.create('Arm two', kit);

    await store.complete(first.id, 0, true);
    await store.navigate(second.id, 1);
    job.parts[0] = { ...job.parts[0], name: 'Changed', dimensions: { width: 1, height: 1, depth: 1 } };

    const reopened = createBuildStore(storage);
    const a = await reopened.open(first.id);
    const b = await reopened.open(second.id);

    expect(a.record.completed).toEqual({ '0': expect.any(String) });
    expect(a.record.index).toBe(0);
    expect(b.record.completed).toEqual({});
    expect(b.record.index).toBe(1);
    expect(a.kit).toEqual(b.kit);
    expect(a.kit.parts[0]).not.toEqual(job.parts[0]);
    await reopened.complete(first.id, 0, false);
    expect((await reopened.open(first.id)).record.completed).toEqual({});
  });

  it('merges concurrent writes by identity and step without replacing other progress', async () => {
    const storage = memoryBuildStorage();
    const store = createBuildStore(storage);
    const other = createBuildStore(storage);
    const { kit } = await prepared();
    const a = await store.create('One', kit);
    const b = await store.create('Two', kit);

    await Promise.all([
      store.complete(a.id, 0, true),
      other.complete(a.id, 1, true),
      other.navigate(a.id, 2),
      store.complete(b.id, 0, true),
    ]);
    expect(Object.keys((await store.open(a.id)).record.completed)).toEqual(['0', '1']);
    expect((await store.open(a.id)).record.index).toBe(2);
    expect(Object.keys((await store.open(b.id)).record.completed)).toEqual(['0']);
  });

  it('publishes nothing after cancellation, failed creation or interrupted progress saving', async () => {
    const storage = memoryBuildStorage();
    const store = createBuildStore(storage);
    const { kit } = await prepared();
    const signal = AbortSignal.abort();

    await expect(store.create('Cancelled', kit, signal)).rejects.toThrow();
    storage.interrupt();
    await expect(store.create('Interrupted', kit)).rejects.toThrow();
    expect(await store.list()).toEqual([]);

    const build = await store.create('Saved', kit);

    storage.interrupt();
    await expect(store.complete(build.id, 0, true)).rejects.toThrow();
    expect((await store.open(build.id)).record.completed).toEqual({});
  });

  it('deduplicates immutable content for twenty builds and refuses storage overflow atomically', async () => {
    const storage = memoryBuildStorage();
    const store = createBuildStore(storage);
    const { kit } = await prepared();

    await store.create('One', kit);

    const one = storage.assetBytes();

    await Promise.all(Array.from({ length: 19 }, (_, i) => store.create(`Build ${i + 2}`, kit)));
    expect(storage.assetBytes()).toBe(one);
    expect(await store.list()).toHaveLength(20);

    const limited = createBuildStore(memoryBuildStorage(), { maxBytes: one - 1, maxBuilds: 100 });

    await expect(limited.create('Too large', kit)).rejects.toThrow();
    expect(await limited.list()).toEqual([]);
  });

  it('refuses a missing geometry dependency and a corrupt incoming manifest without publishing a build', async () => {
    const storage = memoryBuildStorage();
    const store = createBuildStore(storage);
    const { kit } = await prepared();

    await expect(store.create('Corrupt', { ...kit, text: '{}' })).rejects.toThrow();
    expect(await store.list()).toEqual([]);

    const record = await store.create('One', kit);
    const geometry = Object.values(kit.assets).find((asset) => asset.text.includes('"positions"'))!;

    storage.damage(geometry.hash, 'missing');
    await expect(store.open(record.id)).rejects.toThrow();
  });

  it.each(['missing', 'corrupt'] as const)(
    'refuses %s immutable content instead of using the edited scene',
    async (fault) => {
      const storage = memoryBuildStorage();
      const store = createBuildStore(storage);
      const { kit } = await prepared();
      const record = await store.create('One', kit);

      storage.damage(record.kit, fault);
      await expect(store.open(record.id)).rejects.toThrow();
    },
  );

  it('reuses production Kit quantities, servo identities, endpoints and guide order', async () => {
    const { job, kit: preparedKit } = await prepared('mixed-servo arm');
    const kit = readFrozenKit(preparedKit);
    const steps = buildAlongSteps(kit.manifest.guide, kit.project.joints ?? [], [
      ...kit.manifest.wiring!.buses.flatMap((bus) => bus.nets),
      ...kit.manifest.wiring!.power.nets,
    ]);

    expect(kit.manifest.servos.map((servo) => servo.partId).sort()).toEqual(
      steps.flatMap((step) => step.servos.map((servo) => servo.partId)).sort(),
    );
    expect(kit.parts).toEqual(job.parts);
    expect(JSON.stringify(kit.manifest.guide)).toBe(JSON.stringify(job.guide.plan));
    expect(kit.manifest.wiring).toEqual(job.wiring);
    expect(kit.manifest.printed.every((part) => part.outputs.length > 0)).toBe(true);
  });
});

it('shares geometry across different retained Checks and frees only unreferenced assets', async () => {
  const storage = memoryBuildStorage();
  const store = createBuildStore(storage);
  const { kit } = await prepared();
  const first = await store.create('Before checks', kit);
  const initial = storage.assetBytes();
  const updated = readFrozenKit(kit);

  updated.manifest.checks.freshness = 'stale';

  const later = frozenKitContent(updated);
  const second = await store.create('After checks', later);

  expect(Object.keys(later.assets).sort()).toEqual(Object.keys(kit.assets).sort());
  expect(storage.assetBytes()).toBe(initial + later.bytes);
  await store.remove(first.id);
  expect((await store.open(second.id)).kit.manifest.checks.freshness).toBe('stale');
  await store.remove(second.id);
  expect(storage.assetBytes()).toBe(0);
  expect(await store.list()).toEqual([]);
});
