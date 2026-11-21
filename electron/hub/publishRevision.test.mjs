import { describe, expect, it, vi } from 'vitest';
import { publishRepo } from './publishRepo.mjs';

const revision = 'a'.repeat(40);
const client = (commitOid = revision) => ({
  origin: 'https://huggingface.co',
  kind: 'dataset',
  createRepo: vi.fn(),
  listFiles: vi.fn(async () => []),
  preupload: vi.fn(async () => [{ path: 'basecase-robot.json', uploadMode: 'regular' }]),
  commit: vi.fn(async () => ({ commitOid })),
  revisionSha: vi.fn(async () => 'b'.repeat(40)),
});
const job = { namespace: 'tester', name: 'rover', files: { 'basecase-robot.json': new Uint8Array([123, 125]) } };

describe('immutable Hub publication', () => {
  it('returns the acknowledged commit instead of resolving a moving branch', async () => {
    const hub = client();
    const result = await publishRepo(hub, { ...job, includeRevision: true });

    expect(result.revision).toBe(revision);
    expect(hub.revisionSha).not.toHaveBeenCalled();
  });

  it.each(['main', '', '../main'])('refuses an unpinned publication receipt %s', async (commitOid) => {
    await expect(publishRepo(client(commitOid), { ...job, includeRevision: true })).rejects.toThrow(/commit/);
  });

  it('keeps the existing publish response for callers that do not request a revision', async () => {
    expect(await publishRepo(client(), job)).toEqual({
      repo: 'tester/rover',
      url: 'https://huggingface.co/datasets/tester/rover',
    });
  });
});
