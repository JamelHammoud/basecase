import { describe, expect, it } from 'vitest';
import { TopicCollector } from '../topics/collector';
import { encodeTopicLog } from '../topics/topicFile';
import { frameCameraJobs } from './frameCameraJobs';

describe('recorded frame camera discovery', () => {
  it('lists only compressed image topics with recorded image bytes', () => {
    const collector = new TopicCollector();

    collector.add('/front/image', 'sensor_msgs/msg/CompressedImage', 0n, {
      data: new Uint8Array([255, 216, 255, 217]),
    });
    collector.add('/empty/image', 'sensor_msgs/CompressedImage', 0n, { format: 'jpeg' });
    collector.add('/robot/state', 'sensor_msgs/JointState', 0n, { position: [1] });

    const bytes = encodeTopicLog(collector.finish(0n));

    expect(frameCameraJobs.cameras(bytes).result).toEqual(['/front/image']);
    expect(frameCameraJobs.cameras(undefined).result).toEqual([]);
  });
});
