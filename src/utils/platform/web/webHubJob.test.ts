import { beforeEach, expect, it, vi } from 'vitest';
import { fixtureModel } from '../../../skills/fixtureModels';
import { readyStand } from '../../../skills/hubSkillFixtures';
import { kitEnvironment } from '../../../skills/kitEnvironment';
import { robotSchema } from '../../../skills/robotSchema';
import { produceInstallOutcome, reportedInstallScore } from '../../../skills/installOutcome';

const saved = vi.hoisted(() => new Map<string, unknown>());
const remote = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());

vi.mock('../../../hub/remoteOutcomes.mjs', () => ({ remoteRecords: remote }));
vi.mock('./idb', () => ({
  idbAll: async () => [...saved.values()],
  idbPutBounded: async ({ key, value }: { key: string; value: unknown }) => {
    saved.set(key, value);
  },
}));

beforeEach(() => {
  saved.clear();
  remote.mockResolvedValue([]);
});

it('retains local outcomes across worker reloads and deduplicates matching public reports', async () => {
  const sourceModel = fixtureModel('quad-servo');
  const source = {
    repo: 'tester/stand',
    revision: 'a'.repeat(40),
    skill: readyStand(sourceModel, 'source'),
    schema: robotSchema(sourceModel),
  };
  const model = fixtureModel('hexapod');
  const target = robotSchema(model);
  const record = produceInstallOutcome({
    source,
    model,
    environment: kitEnvironment(model, 'stand'),
    status: 'passed',
    evidence: readyStand(model, 'target').evidence!,
  });
  const { WEB_HUB_HANDLERS } = await import('./webHubJob');

  expect((await WEB_HUB_HANDLERS.saveOutcome(record)).result).toEqual({ stored: true, published: false });
  await WEB_HUB_HANDLERS.saveOutcome(record);
  expect(saved.size).toBe(1);

  const before = (await WEB_HUB_HANDLERS.outcomes()).result;
  const score = reportedInstallScore(before, source, target);

  expect(score).toBeGreaterThan(0);
  vi.resetModules();
  remote.mockResolvedValue([record]);

  const reloaded = (await import('./webHubJob')).WEB_HUB_HANDLERS;

  const restored = (await reloaded.outcomes()).result;

  expect(restored).toEqual([record]);
  expect(reportedInstallScore(restored, source, target)).toBe(score);
});

it('refuses oversized outcomes without saving and ignores corrupted local entries', async () => {
  const { WEB_HUB_HANDLERS } = await import('./webHubJob');

  await expect(WEB_HUB_HANDLERS.saveOutcome({ data: 'x'.repeat(256 * 1024) })).rejects.toThrow();
  expect(saved.size).toBe(0);
  saved.set('bad', { id: 'bad', record: undefined });
  expect((await WEB_HUB_HANDLERS.outcomes()).result).toEqual([]);
});
