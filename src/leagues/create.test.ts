import { expect, it } from 'vitest';
import { createLeague } from './create';
import { roverLeagueFixture } from './fixtures';

it('opens a pinned League with no receipts and refuses past, unsupported or oversized manifests', () => {
  const { manifest } = roverLeagueFixture();
  const now = '2026-10-01T00:00:00.000Z';
  const json = JSON.stringify(manifest);

  expect(createLeague(json, now, manifest.engine)).toEqual({ manifest, entries: [] });
  expect(() =>
    createLeague(JSON.stringify({ ...manifest, deadline: '2026-11-01T10:00:00' }), now, manifest.engine),
  ).toThrow('absolute date');
  expect(() => createLeague(json, manifest.deadline, manifest.engine)).toThrow('deadline');
  expect(() => createLeague(json, now, { ...manifest.engine, runner: 'other' })).toThrow('engine');
  expect(() => createLeague(' '.repeat(2 * 1024 * 1024 + 1), now, manifest.engine)).toThrow('large');
});
