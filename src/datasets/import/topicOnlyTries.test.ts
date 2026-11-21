import { describe, expect, it, vi } from 'vitest';
import { writeMcap } from './mcapFixtures';
import { importHandlers } from './dataImportJobs';

vi.mock('../../sim/loadMujoco', () => ({
  loadMujoco: () => {
    throw new Error('Topic import must not load physics');
  },
}));

describe('topic-only saved imports', () => {
  it('imports unmatched signals without a scene model, preserving samples and file identity', async () => {
    const bytes = await writeMcap(
      [0, 1, 2].map((i) => ({
        topic: '/telemetry',
        schema: 'robot.Telemetry',
        encoding: 'json',
        schemaEncoding: 'jsonschema',
        schemaData: new TextEncoder().encode('{}'),
        logTime: BigInt(100 + i) * 1_000_000_000n,
        data: new TextEncoder().encode(JSON.stringify({ volts: [12, 11, 10][i] })),
      })),
    );
    const jobs = importHandlers();
    const summary = await jobs.read({
      kind: 'files',
      name: 'signals.mcap',
      files: [{ path: 'signals.mcap', blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) }],
    });
    const built = await jobs.build({
      model: null,
      plan: { joints: [], unit: 'rad', spans: [] },
      target: {
        sceneId: 'scene',
        modelHash: '',
        origin: { kind: 'file', name: 'signals.mcap', hash: summary!.hash },
        startedAt: '2026-11-17T00:00:00Z',
      },
    });

    expect(built.kept).toHaveLength(1);
    expect(built.kept[0].stored.robot).toEqual({ name: 'signals.mcap', modelHash: '', joints: [] });
    expect(built.kept[0].recording.nq).toBe(0);
    expect(built.kept[0].recording.topics?.length).toBeGreaterThan(0);
    expect(built.kept[0].stored.origin).toMatchObject({ hash: summary!.hash });
    expect(built.kept[0].stored.outcome.verdict).toBe('unjudged');
  });
});
