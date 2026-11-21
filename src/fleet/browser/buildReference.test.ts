import { afterEach, expect, it, vi } from 'vitest';
import { linkBuildReference } from './buildReference';
import { fleetBuildReference, evidenceFromFragment, buildEvidenceFragment } from '../buildReference';

const evidence = {
  build: crypto.randomUUID(),
  repair: crypto.randomUUID(),
  source: 'a'.repeat(64),
  target: 'b'.repeat(64),
};

afterEach(() => vi.unstubAllGlobals());

it('links an existing robot through authenticated inventory without creating robots or sending commands', async () => {
  const organization = crypto.randomUUID();
  const robot = crypto.randomUUID();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: robot, name: 'Rover', attributes: { vendor: 'retained' } })),
    )
    .mockResolvedValueOnce(new Response('{}'));

  vi.stubGlobal('fetch', fetcher);

  const reference = await linkBuildReference(organization, robot, evidence);

  expect(fleetBuildReference(reference)).toEqual(reference);
  expect(evidenceFromFragment(buildEvidenceFragment(evidence))).toEqual(evidence);
  expect(fetcher.mock.calls.map(([url, request]) => [url, request.method ?? 'GET'])).toEqual([
    [`/v1/${organization}/robot/${robot}`, 'GET'],
    [`/v1/${organization}/robot/${robot}`, 'PUT'],
  ]);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ buildRepair: evidence });
  expect(JSON.stringify(reference)).not.toMatch(/token|credential|password/);
});

it.each([403, 401])('refuses denied inventory access (%i) before exporting a reference', async (status) => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }));

  vi.stubGlobal('fetch', fetcher);
  await expect(linkBuildReference(crypto.randomUUID(), crypto.randomUUID(), evidence)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
