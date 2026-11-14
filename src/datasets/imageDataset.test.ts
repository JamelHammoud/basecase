import { describe, expect, it } from 'vitest';
import { newDataset, freezeVersion, readDataset, versionHash } from './datasetFile';
import { imageSetsOf } from './imageDataset';
import { visionFixture } from '../vision/fixtures';
import { datasetCount } from './datasetView';

describe('image members in a Dataset', () => {
  it('loads exactly the frozen frames while retaining tries and versions in the same file', async () => {
    const set = visionFixture();
    const member = { frameSet: set.id, hash: set.id, frames: [set.frames[0].id] };
    const dataset = newDataset({
      id: 'mixed',
      name: 'Blocks',
      task: 'Find blocks',
      members: ['try-1'],
      imageMembers: [member],
      at: 'now',
    });
    const hash = await versionHash(dataset, [], 'robot');
    const frozen = freezeVersion(dataset, hash, 'now');
    const restored = readDataset(JSON.parse(JSON.stringify(frozen.dataset)))!;

    expect(restored.members).toEqual(['try-1']);
    expect(datasetCount(restored)).toBe('1 try, 1 image');
    expect(datasetCount({ ...restored, members: [] })).toBe('1 image');
    expect(restored.versions[0].imageMembers).toEqual([member]);
    expect(await imageSetsOf(restored, async () => set)).toEqual([{ ...set, frames: [set.frames[0]] }]);
    expect(freezeVersion(restored, hash, 'later').dataset).toBe(restored);
    expect(await versionHash({ ...dataset, imageMembers: [] }, [], 'robot')).not.toBe(hash);
  });

  it('refuses missing frame sets, changed content and incomplete membership', async () => {
    const set = visionFixture();
    const dataset = { imageMembers: [{ frameSet: set.id, hash: set.id, frames: [set.frames[0].id] }] };

    await expect(imageSetsOf(dataset, async () => null)).rejects.toThrow('missing or changed');
    await expect(imageSetsOf(dataset, async () => ({ ...set, id: 'changed' }))).rejects.toThrow('missing or changed');
    await expect(
      imageSetsOf({ imageMembers: [{ ...dataset.imageMembers[0], frames: ['missing'] }] }, async () => set),
    ).rejects.toThrow('frames are missing');
  });
});
