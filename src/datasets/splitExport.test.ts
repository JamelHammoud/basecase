import { parquetReadObjects } from 'hyparquet';
import { strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { fixtureSpec } from './fixtures';
import { lerobotFiles } from './lerobot';
import { datasetFiles, LEGACY_FOLDER } from './lerobotExport';
import type { DatasetEpisode } from './lerobotRows';
import { lerobotV3Files, v3DataPath } from './lerobotV3';

const metadata = (files: Record<string, Uint8Array>, path: string) => JSON.parse(strFromU8(files[path]));

describe('frozen LeRobot episode splits', () => {
  it('writes the exact frozen ranges and source assignments in both formats', async () => {
    const spec = await fixtureSpec({ lengths: [2, 3, 4, 5] });
    const splits: DatasetEpisode['split'][] = ['train', 'train', 'validation', 'test'];

    spec.episodes = spec.episodes.map((episode, index) => ({ ...episode, split: splits[index] }));

    const files = await datasetFiles(spec);
    const expected = { train: '0:2', validation: '2:3', test: '3:4' };
    const rows = await parquetReadObjects({ file: files[v3DataPath(0)].slice().buffer });

    for (const prefix of ['', `${LEGACY_FOLDER}/`]) {
      expect(metadata(files, `${prefix}meta/info.json`).splits).toEqual(expected);
      expect(metadata(files, `${prefix}meta/basecase.json`).episodes).toEqual(
        spec.episodes.map((episode, episode_index) => ({ episode_index, ...episode.source, split: episode.split })),
      );
    }

    expect(rows.map((row) => Number(row.episode_index))).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
    expect(spec.episodes.map((episode) => episode.source.try)).toEqual(['try-0', 'try-1', 'try-2', 'try-3']);
  });

  it('omits absent splits without assigning held-out episodes to train', async () => {
    const spec = await fixtureSpec({ lengths: [2, 2] });

    spec.episodes = spec.episodes.map((episode) => ({ ...episode, split: 'validation' }));

    const files = await datasetFiles(spec);

    expect(metadata(files, 'meta/info.json').splits).toEqual({ validation: '0:2' });
    expect(metadata(files, `${LEGACY_FOLDER}/meta/info.json`).splits).toEqual({ validation: '0:2' });
  });

  it('keeps the old all-train range when no episode has an explicit assignment', async () => {
    const files = await datasetFiles(await fixtureSpec());

    for (const prefix of ['', `${LEGACY_FOLDER}/`]) {
      expect(metadata(files, `${prefix}meta/info.json`).splits).toEqual({ train: '0:3' });
      expect(
        metadata(files, `${prefix}meta/basecase.json`).episodes.every((episode: object) => !('split' in episode)),
      ).toBe(true);
    }
  });

  it('refuses a partial assignment in either writer', async () => {
    const spec = await fixtureSpec();

    spec.episodes[0].split = 'train';

    expect(() => lerobotFiles(spec)).toThrow('Assign a split to every episode.');
    expect(() => lerobotV3Files({ ...spec, videos: [] }, {})).toThrow('Assign a split to every episode.');
  });

  it('refuses a split with noncontiguous episode indices in either writer', async () => {
    const spec = await fixtureSpec();
    const splits: DatasetEpisode['split'][] = ['train', 'validation', 'train'];

    spec.episodes = spec.episodes.map((episode, index) => ({ ...episode, split: splits[index] }));

    expect(() => lerobotFiles(spec)).toThrow('Group episodes by split before exporting.');
    expect(() => lerobotV3Files({ ...spec, videos: [] }, {})).toThrow('Group episodes by split before exporting.');
  });
});
