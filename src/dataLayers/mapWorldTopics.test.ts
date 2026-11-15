import { describe, expect, it } from 'vitest';
import { TopicCollector } from '../topics/collector';
import { encodeTopicLog } from '../topics/topicFile';
import { mapJobs } from './mapJobs';

describe('clipped reconstruction topics', () => {
  it.each(['rgb8', 'bgr8', 'mono8', '16UC1', 'mono16', '32FC1', ''])(
    'checks clipped %s images only when they supply depth evidence',
    async (encoding) => {
      const topics = new TopicCollector();

      topics.add('/scan', 'sensor_msgs/LaserScan', 0n, {
        header: { frame_id: 'map' },
        angle_min: 0,
        angle_increment: 1,
        range_min: 0.1,
        range_max: 10,
        ranges: Float64Array.of(1),
      });
      topics.add('/camera/image', 'sensor_msgs/Image', 0n, { encoding });

      const log = topics.finish(0n);

      log.topics.find((topic) => topic.topic === '/camera/image')!.clipped = true;

      const result = mapJobs().makeWorld({
        topics: encodeTopicLog(log),
        sourceTry: 'with-camera',
        name: 'Map',
        matching: false,
      });

      if (!encoding || ['16UC1', 'mono16', '32FC1'].includes(encoding)) {
        await expect(result).rejects.toThrow(/unclipped/);

        return;
      }

      const { result: prepared } = await result;

      expect(prepared.kind).toBe('mesh');

      if (prepared.kind === 'mesh') expect(prepared.world.reconstruction?.occupied).toEqual([[10, 0, 0]]);
    },
  );
});
