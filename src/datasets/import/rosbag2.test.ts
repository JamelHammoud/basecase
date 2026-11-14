import { describe, expect, it } from 'vitest';
import { ARM_JOINTS, armJointStates, armPose, writeMcap } from './mcapFixtures';
import { BAG_METADATA, BAG_NOT_MCAP, bagMissing, isRosbag2Folder, readRosbag2 } from './rosbag2';
import type { SourceFile, SourceFolder } from './types';

const fileOf = (path: string, bytes: Uint8Array): SourceFile => ({
  path,
  size: bytes.byteLength,
  read: () => Promise.resolve(bytes),
});

const text = (value: string) => new TextEncoder().encode(value);

const metadata = (storage: string, files: string) =>
  [
    'rosbag2_bagfile_information:',
    '  version: 9',
    `  storage_identifier: ${storage}`,
    '  duration:',
    '    nanoseconds: 2000000000',
    `  relative_file_paths:${files}`,
    '  files:',
    '    - path: ignored.mcap',
    '      message_count: 0',
    '',
  ].join('\n');

const BLOCK_LIST = '\n    - arm_0.mcap\n    - "arm_1.mcap"';

async function armBag(meta: string, skip: string[] = []): Promise<SourceFolder> {
  const first = await writeMcap(armJointStates({ hz: 100, seconds: 1, start: 50 }), { chunked: true });
  const second = await writeMcap(armJointStates({ hz: 100, seconds: 1, start: 51.01 }));
  const files = [
    fileOf('arm/metadata.yaml', text(meta)),
    fileOf('arm/arm_0.mcap', first),
    fileOf('arm/arm_1.mcap', second),
  ];

  return { name: 'arm', files: files.filter((file) => !skip.includes(file.path)) };
}

describe('rosbag2 folders', () => {
  it('finds the folder holding metadata.yaml', () => {
    expect(isRosbag2Folder(['arm/arm_0.mcap', 'arm/metadata.yaml'])).toBe('arm/');
    expect(isRosbag2Folder(['metadata.yaml', 'a/b/metadata.yaml'])).toBe('');
    expect(isRosbag2Folder(['arm/arm_0.mcap', 'arm/my_metadata.yaml'])).toBeNull();
  });

  it.each([
    ['a block list', BLOCK_LIST],
    ['a flow list', " [arm_0.mcap, 'arm_1.mcap']"],
  ])('reads split files in order from %s', async (_, list) => {
    const data = (await readRosbag2(await armBag(metadata('mcap', list))))!;
    const [episode] = data.episodes;

    expect(data.format).toBe('mcap');
    expect(data.names).toEqual(ARM_JOINTS);
    expect(episode.t).toHaveLength(101);

    for (const [frame, time] of episode.t.entries()) {
      const expected = armPose(time > 1 ? time - 1.01 : time);
      const frameStart = frame * ARM_JOINTS.length;

      expected.forEach((value, j) => expect(Math.abs(episode.state[frameStart + j] - value)).toBeLessThan(1e-9));
    }
  });

  it('refuses a bag stored in sqlite3', async () => {
    await expect(readRosbag2(await armBag(metadata('sqlite3', BLOCK_LIST)))).rejects.toThrow(BAG_NOT_MCAP);
  });

  it('refuses a bag missing one of its files', async () => {
    await expect(readRosbag2(await armBag(metadata('mcap', BLOCK_LIST), ['arm/arm_1.mcap']))).rejects.toThrow(
      bagMissing('arm_1.mcap'),
    );
  });

  it.each([
    ['a path outside the folder', '\n    - ../secret.mcap'],
    ['a nested path', '\n    - nested/arm_0.mcap'],
    ['a Windows path', '\n    - nested\\arm_0.mcap'],
    ['no files', ' []'],
  ])('refuses metadata listing %s', async (_, list) => {
    await expect(readRosbag2(await armBag(metadata('mcap', list)))).rejects.toThrow(BAG_METADATA);
  });

  it('leaves a metadata.yaml that isn’t a rosbag2 description to robot import', async () => {
    expect(await readRosbag2(await armBag('storage_identifier: mcap\n'))).toBeNull();
  });
});
