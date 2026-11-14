import { describe, expect, it } from 'vitest';
import { freezeVersion, newDataset, readDataset, versionHash } from './datasetFile';

const imageMembers = [{ frameSet: 'a'.repeat(64), frames: ['b'.repeat(64)], hash: 'c'.repeat(64) }];
const made = () =>
  newDataset({ id: 'images', name: 'Images', task: 'Find the cube', members: [], at: 'now', imageMembers });

describe('dataset image membership', () => {
  it('reads legacy datasets as empty image membership and preserves selected images', () => {
    const dataset = made();
    const legacy = { ...dataset, imageMembers: undefined };

    expect(readDataset(legacy)?.imageMembers).toEqual([]);
    expect(readDataset(JSON.parse(JSON.stringify(dataset)))).toEqual(dataset);
    expect(readDataset({ ...dataset, imageMembers: [{ ...imageMembers[0], frameSet: '../escape' }] })).toBeNull();
    expect(readDataset({ ...dataset, imageMembers: [{ ...imageMembers[0], frames: ['wrong'] }] })).toBeNull();
  });

  it('versions image selections and their content separately from try membership', async () => {
    const dataset = made();
    const hash = await versionHash(dataset, [], 'model');
    const one = freezeVersion(dataset, hash, 'first');
    const changed = { ...one.dataset, imageMembers: [{ ...imageMembers[0], hash: 'd'.repeat(64) }] };
    const changedHash = await versionHash(changed, [], 'model');
    const two = freezeVersion(changed, changedHash, 'second');

    expect(changedHash).not.toBe(hash);
    expect(two.version.n).toBe(2);
    expect(one.version.imageMembers).toEqual(imageMembers);
    expect(two.version.imageMembers).toEqual(changed.imageMembers);
    expect(readDataset(JSON.parse(JSON.stringify(two.dataset)))).toEqual(two.dataset);
    expect(await versionHash(dataset, [], 'model', [{ id: imageMembers[0].frames[0], hash: 'e'.repeat(64) }])).not.toBe(
      hash,
    );
  });
});
