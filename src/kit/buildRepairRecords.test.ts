import { expect, it } from 'vitest';
import { box, fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { createBuildStore } from './buildRecords';
import { memoryBuildStorage } from './buildStorage.fixtures';
import { freezeBuildKit } from './frozenKit';
import { kitFixture } from './kit.fixtures';

async function revision(changed = false) {
  const job = kitFixture('differential rover', (parts) => [
    ...parts,
    box('service-plate', [1000, 20, 0], [changed ? 31 : 30, 4, 20], 10),
  ]);

  job.project.labelParts = false;
  job.checks = {
    status: 'ready',
    checks: [],
    blockers: [],
    notes: [],
    ignored: [],
    ignoredRules: [],
    findings: [],
    rows: [],
    fingerprint: 'fixture-checks',
    checkedAt: '2026-11-20T12:00:00Z',
  };
  job.checksFingerprint = job.checks.fingerprint;

  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));

  return freezeBuildKit({ job, meshes });
}

it('retains both revisions and independent build progress across interruption, cancellation and reopening', async () => {
  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const source = await revision();
  const target = await revision(true);
  const [one, two] = await builds.createMany(['One', 'Two'], source);

  await builds.complete(one.id, 0, true);
  await builds.complete(two.id, 1, true);

  const otherBefore = await builds.open(two.id);
  const request = crypto.randomUUID();
  const input = { id: one.id, target, request, signal: new AbortController().signal };
  const started = await builds.startRepair(input);
  const repair = started.repairs!.at(-1)!;

  expect(repair.source).toBe(source.hash);
  expect(repair.target).toBe(target.hash);
  expect(repair.build).toBe(one.id);
  expect(repair.affected).toContain('service-plate');
  expect((await builds.startRepair(input)).repairs).toEqual(started.repairs);
  expect((await builds.open(one.id)).record.configuration).toBeUndefined();
  storage.interrupt();
  await expect(builds.repairAction({ id: one.id, repair: request, step: 0, complete: true })).rejects.toThrow();
  expect((await builds.open(one.id)).record.repairs!.at(-1)!.completed).toEqual({});
  await builds.repairAction({ id: one.id, repair: request, step: 0, complete: true });

  const beforeReplay = (await builds.open(one.id)).record.repairs!.at(-1)!.completed;

  await builds.repairAction({ id: one.id, repair: request, step: 0, complete: true });
  expect((await builds.open(one.id)).record.repairs!.at(-1)!.completed).toEqual(beforeReplay);
  await builds.cancelRepair(one.id, request);
  await expect(builds.remove(one.id)).rejects.toThrow();
  await expect(builds.repairAction({ id: one.id, repair: request, step: 1, complete: true })).rejects.toThrow(
    'Resume the repair first.',
  );
  expect((await builds.open(one.id)).record.repairs!.at(-1)!.completed).toEqual(beforeReplay);

  const reopened = createBuildStore(storage);
  const resumed = await reopened.resumeRepair(one.id, request);

  expect(resumed.repairs!.at(-1)!.completed).toEqual(beforeReplay);
  expect(await reopened.open(two.id)).toEqual(otherBefore);
  expect((await reopened.openRevision(one.id, source.hash)).manifest.design.name).toBe('differential rover');
  await expect(reopened.finishRepair({ id: one.id, repair: request, purchases: {} })).rejects.toThrow();
  expect((await reopened.open(one.id)).record.configuration).toBeUndefined();
});

it('requires resumption before completing a canceled zero-action repair', async () => {
  const builds = createBuildStore(memoryBuildStorage());
  const source = await revision();
  const build = await builds.create('One', source);
  const started = await builds.startRepair({
    id: build.id,
    target: source,
    request: crypto.randomUUID(),
    signal: new AbortController().signal,
  });
  const repair = started.repairs![0];

  expect(repair.count).toBe(0);
  await builds.cancelRepair(build.id, repair.id);
  await expect(builds.stageRepair(build.id, repair.id)).rejects.toThrow('Resume the repair first.');
  expect((await builds.open(build.id)).record.configuration).toBeUndefined();
  await builds.resumeRepair(build.id, repair.id);
  await builds.stageRepair(build.id, repair.id);

  const completed = await Promise.all([
    builds.finishRepair({ id: build.id, repair: repair.id, purchases: {} }),
    builds.finishRepair({ id: build.id, repair: repair.id, purchases: {} }),
  ]);

  expect(completed[0]).toEqual(completed[1]);
  expect(completed[0].repairs![0].state).toBe('complete');
});

it('rejects a stale target publication, aborted preparation and deleted source without writing repair state', async () => {
  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const source = await revision();
  const target = await revision(true);
  const build = await builds.create('One', source);

  await expect(
    builds.startRepair({ id: build.id, target, request: crypto.randomUUID(), signal: AbortSignal.abort() }),
  ).rejects.toThrow();
  expect((await builds.open(build.id)).record.repairs).toBeUndefined();
  await builds.remove(build.id);
  await expect(
    builds.startRepair({ id: build.id, target, request: crypto.randomUUID(), signal: new AbortController().signal }),
  ).rejects.toThrow();
});

it('refuses stale selection inside atomic publication and retains no target assets', async () => {
  const storage = memoryBuildStorage();
  const builds = createBuildStore(storage);
  const source = await revision();
  const target = await revision(true);
  const record = await builds.create('One', source);
  const bytes = storage.assetBytes();

  await expect(
    builds.startRepair({
      id: record.id,
      target,
      request: crypto.randomUUID(),
      signal: new AbortController().signal,
      guard: () => {
        throw new Error('Selection changed');
      },
    }),
  ).rejects.toThrow('Selection changed');
  expect(storage.assetBytes()).toBe(bytes);
  expect((await builds.open(record.id)).record.repairs).toBeUndefined();
});

it('links only a matching Fleet reference and never retains credentials from imported data', async () => {
  const builds = createBuildStore(memoryBuildStorage());
  const source = await revision();
  const target = await revision(true);
  const record = await builds.create('One', source);
  const started = await builds.startRepair({
    id: record.id,
    target,
    request: crypto.randomUUID(),
    signal: new AbortController().signal,
  });
  const repair = started.repairs!.at(-1)!;
  const reference = {
    format: 'basecase-fleet-build-reference',
    organization: crypto.randomUUID(),
    robot: crypto.randomUUID(),
    build: record.id,
    repair: repair.id,
    source: source.hash,
    target: target.hash,
    credential: 'discarded',
  };
  const linked = await builds.linkRepairFleet({ id: record.id, repair: repair.id, reference });

  expect(linked.repairs!.at(-1)!.fleet).toEqual({ organization: reference.organization, robot: reference.robot });
  expect(JSON.stringify(linked)).not.toContain('discarded');
  await expect(
    builds.linkRepairFleet({ id: record.id, repair: repair.id, reference: { ...reference, target: 'f'.repeat(64) } }),
  ).rejects.toThrow();
});
