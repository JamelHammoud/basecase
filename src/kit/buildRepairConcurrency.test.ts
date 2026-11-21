import { expect, it } from 'vitest';
import { repairKitFixture } from './buildRepair.fixtures';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';

it('serializes competing repair starts and recovers duplicate requests with the committed record', async () => {
  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const source = await repairKitFixture();
  const target = await repairKitFixture(undefined, 'geometry');
  const build = await builds.create('One', source.content);
  const base = { id: build.id, target: target.content, signal: new AbortController().signal };
  const results = await Promise.allSettled([
    builds.startRepair({ ...base, request: crypto.randomUUID() }),
    createBuildStore(storage).startRepair({ ...base, request: crypto.randomUUID() }),
  ]);

  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect((await builds.open(build.id)).record.repairs).toHaveLength(1);

  const second = await builds.create('Two', source.content);
  const request = crypto.randomUUID();
  const operation = { ...base, id: second.id, request };
  const duplicates = await Promise.all([
    builds.startRepair(operation),
    createBuildStore(storage).startRepair(operation),
  ]);

  expect(duplicates[0]).toEqual(duplicates[1]);
  expect((await builds.open(second.id)).record.repairs).toHaveLength(1);
});

it('retains both Kits after their creator builds are deleted', async () => {
  const builds = createBuildStore(memoryBuildStorage());
  const source = await repairKitFixture();
  const target = await repairKitFixture(undefined, 'geometry');
  const sourceTemplate = await builds.create('Source template', source.content);
  const targetTemplate = await builds.create('Target template', target.content);
  const unit = await builds.create('Unit', source.content);
  const started = await builds.startRepair({
    id: unit.id,
    target: target.content,
    request: crypto.randomUUID(),
    signal: new AbortController().signal,
  });

  await builds.remove(sourceTemplate.id);
  await builds.remove(targetTemplate.id);
  expect((await builds.openRevision(unit.id, source.content.hash)).geometry).toEqual(source.kit.geometry);
  expect((await builds.openRevision(unit.id, target.content.hash)).geometry).toEqual(target.kit.geometry);
  expect((await builds.open(unit.id)).record.repairs).toEqual(started.repairs);
});
