import { recordingTopics } from '../topics/recordingTopics';
import { schemaKey } from '../topics/schemas';
import { reply } from '../utils/workerRpc';

export const frameCameraJobs = {
  cameras: (topics: Uint8Array | undefined) =>
    reply(
      (recordingTopics({ topics })?.topics ?? [])
        .filter((topic) => schemaKey(topic.schema) === 'sensor_msgs/CompressedImage' && topic.blobs.has('data'))
        .map((topic) => topic.topic),
    ),
};
