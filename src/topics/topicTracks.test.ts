import { describe, expect, it } from 'vitest';
import { drawTrack, freshDraw } from '../dataLayers/draw';
import { pointSink } from '../dataLayers/pointSink';
import { treeAt, treeFrames } from '../dataLayers/tf';
import { writeMcap } from '../datasets/import/mcapFixtures';
import { readMcap } from '../datasets/import/recordingFiles';
import { turtlebotMessages } from '../datasets/import/topicFixtures';
import { EMPTY_TREE, linkAnchor } from '../three/viewport/dataFrames';
import { recordingTopics } from './recordingTopics';
import { topicTracks } from './topicTracks';

describe('a recording’s scans, frames and odometry on the canvas', () => {
  it('hands each drawable topic to the data layers at the try’s playhead', async () => {
    const bytes = await writeMcap(turtlebotMessages(1_700_000_000, 2), { chunked: true });
    const [episode] = (await readMcap([{ name: 'turtlebot.mcap', bytes }])).episodes;
    const tracks = topicTracks(recordingTopics(episode)!);
    const scan = tracks.find((t) => t.name === '/scan')!;
    const out = freshDraw(pointSink(10_000));
    const anchors = { links: new Map([['base_scan', linkAnchor([0, 0, 0], [1, 0, 0, 0])]]), base: null };

    expect(tracks.map((t) => [t.name, t.schema])).toEqual([
      ['/odom', 'nav_msgs/Odometry'],
      ['/scan', 'sensor_msgs/LaserScan'],
      ['/tf', 'tf2_msgs/TFMessage'],
    ]);

    drawTrack(scan, { at: 1, tree: EMPTY_TREE, colorBy: null, anchors }, out);

    expect(out.sink.count).toBe(360);
    expect(out.missing).toBeNull();
    expect(treeFrames(treeAt(tracks, 1))).toContain('base_footprint');
  });
});
