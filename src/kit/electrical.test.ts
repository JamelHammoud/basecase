import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { expectedConnections } from '../../tools/electrical/expected';
import type { ElectricalProjection } from '../wiring/electricalTypes';
import { boardFixtureInput } from '../../tools/electrical/boardFixtures';
import { completedRoutedFixture } from '../../tools/electrical/routedFixtures';
import { electricalScenes } from '../wiring/electricalFixtures';
import { prepareBoardExport } from '../wiring/boardExportPreparation';
import { buildBom } from '../utils/bom';
import { buildKit, kitManifest } from './buildKit';
import { electricalKitFiles, checkedKitElectrical } from './electrical';
import { electricalKitJob } from './electrical.fixtures';
import { checkElectricalSize } from '../wiring/electricalSource';
import { KIT_MAX_BYTES } from './limits';
import type { KitManifest } from './types';
import type { BoardNativeResult } from '../wiring/boardRoutingTypes';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const connectorCounts: Record<string, number> = {
  'tethered-so101': 0,
  'battery-rover': 0,
  quadruped: 0,
  hexapod: 0,
  'pan-tilt-camera': 0,
  gripper: 0,
  'mixed-voltage': 0,
  'dual-bus-arm': 2,
  'sensor-rich-inspection': 0,
  'fixed-appliance': 0,
};

function netIdentities(projection: ElectricalProjection, exceptions: Array<{ reference: string; pin: string }>) {
  const endpoints = new Map(projection.endpoints.map((endpoint) => [endpoint.reference, endpoint]));

  const nodeIdentity = (node: { reference: string; pin: string }) => {
    const endpoint = endpoints.get(node.reference)!;

    return JSON.stringify([endpoint.partId ?? '', endpoint.port, node.pin]);
  };

  return [
    ...projection.nets.map((net) => net.nodes.map(nodeIdentity).sort()),
    ...exceptions.map((node) => [nodeIdentity(node)]),
  ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

const servoCounts: Record<string, number> = {
  'tethered-so101': 6,
  'battery-rover': 2,
  quadruped: 12,
  hexapod: 18,
  'pan-tilt-camera': 2,
  gripper: 1,
  'mixed-voltage': 5,
  'dual-bus-arm': 5,
  'sensor-rich-inspection': 4,
  'fixed-appliance': 1,
};

function recordMeasurements(input: {
  name: string;
  start: number;
  memory: NodeJS.MemoryUsage[];
  archive: Uint8Array;
  files: Record<string, Uint8Array>;
  electrical: import('./electrical').KitElectrical;
}) {
  const { name, start, memory, archive, files, electrical } = input;

  memory.push(process.memoryUsage());

  const mechanical = Object.fromEntries(Object.entries(files).filter(([path]) => !path.startsWith('electrical/')));

  process.stdout.write(
    `kit-electrical-measurement ${JSON.stringify({
      name,
      preparationMs: performance.now() - start,
      archiveBytes: archive.byteLength,
      addedArtifactBytes: archive.byteLength - zipSync(mechanical, { level: 6 }).byteLength,
      sampledPeakRss: Math.max(...memory.map((sample) => sample.rss)),
      sampledPeakHeap: Math.max(...memory.map((sample) => sample.heapUsed)),
      retainedArtifactBytes: Object.values(electrical.files).reduce((n, bytes) => n + bytes.byteLength, 0),
    })}\n`,
  );
}

function expectCarrierGuide(manifest: KitManifest) {
  expect(manifest.guide.partIds).toContain('board');

  const carrier = manifest.guide.items.find((item) => item.partIds.includes('board'));

  expect(carrier!.kind).toBe('fabricated');
  expect(manifest.guide.tools.some((tool) => tool.itemKeys.includes(carrier!.key))).toBe(false);
}

let routedFixture: Awaited<ReturnType<typeof completedRoutedFixture>>;

beforeAll(async () => {
  routedFixture = await completedRoutedFixture();
});

describe('electrical manufacturing kit composition', () => {
  it.each(electricalScenes())(
    'binds diagnostic sources and total assembly demand for $name',
    async ({ name, scene }) => {
      const start = performance.now();
      const memory = [process.memoryUsage()];
      const board = await boardFixtureInput(scene);
      const job = await electricalKitJob(name, board.input);
      const prepared = await prepareBoardExport(board.input);

      job.electrical = await electricalKitFiles({ prepared, result: null, designFingerprint: job.designFingerprint! });
      job.purchases = { 'component:jst-b3b-eh-a': { onHand: 1 } };

      memory.push(process.memoryUsage());

      const bom = buildBom(job);
      const archive = await buildKit(job);
      const files = unzipSync(archive);
      const manifest = JSON.parse(strFromU8(files['kit.json']));
      const electrical = JSON.parse(strFromU8(files['electrical/manifest.json']));
      const requirements = JSON.parse(strFromU8(files['electrical/requirements.json']));

      expect(manifest.electrical).toMatchObject({ fabrication: 'missing', partId: 'board' });
      expect(manifest.electrical.designFingerprint).toBe(manifest.design.fingerprint);
      expect(electrical.sourceFingerprint).toBe(prepared.sourceFingerprint);
      expect(netIdentities(requirements.projection, requirements.ruleExceptions)).toEqual(
        expectedConnections(name, scene).groups,
      );
      expect(manifest.servos).toHaveLength(servoCounts[name]);
      expect(
        manifest.purchases
          .filter((line: { key: string }) => line.key.includes('waveshare-bus-servo-adapter-a'))
          .reduce((n: number, line: { qty: number }) => n + line.qty, 0),
      ).toBe(name === 'hexapod' ? 2 : 1);
      expect(
        manifest.packing
          .filter((row: { partIds: string[] }) =>
            row.partIds.some((id) => /^board_mount[1-4]_(screw|spacer)$/u.test(id)),
          )
          .reduce((n: number, row: { qty: number }) => n + row.qty, 0),
      ).toBe(8);
      expect(requirements.board.requirements.length).toBeGreaterThan(0);
      expect(Object.keys(files).some((path) => path.includes('/fabrication/'))).toBe(false);
      expect(manifest.printed.some((part: { id: string }) => part.id === 'board')).toBe(false);
      expect(bom.madeElsewhere.filter((part) => part.id === 'board')).toEqual([
        { id: 'board', name: 'Electronics board', process: 'PCB fabrication' },
      ]);
      expect(
        manifest.packing.filter((row: { partIds: string[] }) => row.partIds.includes('board')).length,
      ).toBeGreaterThan(0);

      const connectors = manifest.purchases.find((line: { key: string }) => line.key === 'component:jst-b3b-eh-a');

      expect(connectors?.qty ?? 0).toBe(connectorCounts[name]);

      if (connectors) expect(connectors.toBuy).toBe(connectorCounts[name] - 1);

      for (const [path, hash] of Object.entries(electrical.hashes))
        expect(digest(files[`electrical/${path}`])).toBe(hash);

      expect(digest(files['electrical/manifest.json'])).toBe(manifest.electrical.manifestHash);
      expect(strFromU8(files['electrical/source.json'])).toBe(prepared.files['source.json']);
      expectCarrierGuide(manifest);
      expect(kitManifest(job).checks).toEqual({ freshness: 'not run', result: null });
      recordMeasurements({ name, start, memory, archive, files, electrical: job.electrical });
    },
  );
});

describe('electrical kit diagnostic boundaries', () => {
  it.each(['missing tools', 'failed validation'] as const)('retains requirements after %s', async (fault) => {
    const fixture = routedFixture;
    const result: BoardNativeResult = {
      key: fixture.prepared.request!.key!,
      version: fault === 'missing tools' ? null : '9.0.6',
      issues: [fault === 'missing tools' ? 'board-validator' : 'board-drc'],
      report: null,
      files: { 'fabrication/rejected.gbr': 'rejected output' },
      metrics: { cliMs: 0, outputBytes: 0 },
    };
    const electrical = await electricalKitFiles({ prepared: fixture.prepared, result, designFingerprint: 'design' });

    expect(electrical.manifest.fabrication).toBe('missing');
    expect(Object.keys(electrical.files).some((path) => path.startsWith('fabrication/'))).toBe(false);
    expect(strFromU8(electrical.files['requirements.json'])).toContain(result.issues[0]);
  });

  it('refuses stale kit identities and corrupted evidence', async () => {
    const fixture = routedFixture;
    const job = await electricalKitJob('bound-board', fixture.input);

    job.electrical = await electricalKitFiles({
      prepared: fixture.prepared,
      result: null,
      designFingerprint: job.designFingerprint!,
    });
    job.electrical.files['robot.kicad_pcb'][0] ^= 1;
    await expect(checkedKitElectrical(job)).rejects.toThrow();
    job.electrical.manifest.designFingerprint = 'old';
    await expect(checkedKitElectrical(job)).rejects.toThrow();
  });

  it.each(['source hash', 'holes', 'bottom side'] as const)('withholds fabrication after changed %s', async (fault) => {
    const fixture = routedFixture;
    const input = structuredClone(fixture.input);
    const board = input.project.electronicsBoard!;

    if (fault === 'source hash') board.routed!.sourceFingerprint = '0'.repeat(64);

    if (fault === 'holes') board.holes[0].diameterMm = 4;

    if (fault === 'bottom side') board.side = 'bottom';

    const prepared = await prepareBoardExport(input);
    const result = await electricalKitFiles({ prepared, result: null, designFingerprint: 'changed' });
    const reopened = await prepareBoardExport({
      ...JSON.parse(JSON.stringify({ parts: input.parts, project: input.project })),
      meshFiles: input.meshFiles,
    });

    expect(prepared.request).toBeNull();
    expect(result.manifest.fabrication).toBe('missing');
    expect(Object.keys(result.files).some((path) => path.startsWith('fabrication/'))).toBe(false);
    expect(prepared.files).toEqual(reopened.files);
    expect(strFromU8(result.files['requirements.json'])).toContain('board-stale-routing');
  });

  it('bounds electrical sources before export preparation hashes or returns them', async () => {
    await expect(prepareBoardExport(routedFixture.input, 1)).rejects.toThrow('256 MB');
  });

  it('counts electrical bytes with mechanical files before reading or hashing artifacts', async () => {
    const job = await electricalKitJob('combined-limit', routedFixture.input);

    job.electrical = {
      manifest: {} as import('./electrical').KitElectricalManifest,
      files: { oversized: { byteLength: KIT_MAX_BYTES } as Uint8Array<ArrayBuffer> },
    };

    await expect(buildKit(job)).rejects.toThrow('256 MB');
  });

  it('applies the expanded archive limit before encoding electrical sources', async () => {
    expect(() =>
      checkElectricalSize({ 'source.json': { length: KIT_MAX_BYTES + 1 } as string }, KIT_MAX_BYTES),
    ).toThrow('256 MB');
  });
});
