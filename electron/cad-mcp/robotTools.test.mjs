import { afterEach, expect, it, vi } from 'vitest';
import { retargetMotion } from './robotTools.mjs';
import { bridge } from './shared.mjs';
import { publicFetch } from '../publicFetch.mjs';

vi.mock('./shared.mjs', async () => ({
  VIEW: (await import('zod')).z.enum(['iso']),
  EVIDENCE_DIR: undefined,
  bridge: vi.fn(async () => ({ text: 'Retargeted' })),
  evidencePath: vi.fn(),
  fail: (error) => ({ error: error.message }),
  text: (text) => ({ text }),
  withImages: (reply) => reply,
}));
vi.mock('../publicFetch.mjs', async (original) => ({
  ...(await original()),
  publicFetch: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

it('downloads retarget URLs through publicFetch before the existing renderer bridge', async () => {
  vi.mocked(publicFetch).mockResolvedValue(new Response('HIERARCHY'));

  await expect(retargetMotion.handler({ url: 'https://example.com/walk.bvh' })).resolves.toEqual({
    text: 'Retargeted',
  });
  expect(publicFetch).toHaveBeenCalledWith(
    'https://example.com/walk.bvh',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(bridge).toHaveBeenCalledWith('retarget', expect.objectContaining({ text: 'HIERARCHY' }), 300000);
});

it('never forwards a refused public address to the renderer', async () => {
  vi.mocked(publicFetch).mockRejectedValue(new Error('Use a public URL.'));

  await expect(retargetMotion.handler({ url: 'https://127.0.0.1/walk.bvh' })).resolves.toEqual({
    error: 'Use a public URL.',
  });
  expect(bridge).not.toHaveBeenCalled();
});

it('keeps an empty downloaded BVH from falling back to a renderer download', async () => {
  vi.mocked(publicFetch).mockResolvedValue(new Response(''));

  await expect(retargetMotion.handler({ url: 'https://example.com/empty.bvh' })).resolves.toEqual({
    text: 'Give file (an attached .bvh) or url.',
  });
  expect(bridge).not.toHaveBeenCalled();
});
