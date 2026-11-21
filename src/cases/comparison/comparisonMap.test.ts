import { beforeAll, expect, it } from 'vitest';
import { corridorMcap } from '../../dataLayers/mapFixtures';
import { importHandlers } from '../../datasets/import/dataImportJobs';
import { encodeRecording } from '../recordingFile';
import { comparisonJobs } from './comparisonJobs';
import { createHash } from 'node:crypto';

const jobs = comparisonJobs();
let bytes: Uint8Array;
let sourceTry: string;

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

beforeAll(async () => {
  const mcap = await corridorMcap();
  const imported = importHandlers();
  const summary = await imported.read({
    kind: 'files',
    name: 'corridor.mcap',
    files: [{ path: 'corridor.mcap', blob: new Blob([mcap as Uint8Array<ArrayBuffer>]) }],
  });
  const built = await imported.build({
    model: null,
    plan: { joints: [], unit: 'rad', spans: [] },
    target: {
      sceneId: 'scene',
      modelHash: '',
      origin: { kind: 'file', name: 'corridor.mcap', hash: summary!.hash },
      startedAt: '2026-11-18T00:00:00Z',
    },
  });
  const { stored, recording } = built.kept[0];

  sourceTry = stored.id;
  bytes = encodeRecording(recording);
  await jobs.open({ stored, bytes });
});

it('reconstructs a complete saved-source map and rebuilds it with matching disabled', async () => {
  const before = hash(bytes);
  const matched = await jobs.map({ matching: true });
  const unmatched = await jobs.map({ matching: false });

  expect(matched.result!.points.length / 3).toBeGreaterThan(360);
  expect(unmatched.result!.points.length).toBeGreaterThan(matched.result!.points.length);
  expect(matched.transfer).toContain(matched.result!.points.buffer);
  expect(hash(bytes)).toBe(before);
});

it('makes a saved world from the source-owned recording with exact import provenance', async () => {
  const before = hash(bytes);
  const world = await jobs.mapWorld({ name: 'Corridor', matching: true });

  if (world.result.kind !== 'mesh') throw new Error('Expected a reconstructed mesh world');

  expect(world.result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(world.result.pieces.length).toBeGreaterThan(1);
  expect(world.result.pieces.length).toBeLessThanOrEqual(64);
  expect(world.result.world.reconstruction?.sourceTry).toBe(sourceTry);
  expect(world.result.world.reconstruction?.estimates.floor).toBe(true);
  expect(hash(bytes)).toBe(before);
});
