import { reply, serve } from '../../utils/workerRpc';
import { uploadTryVideos } from './videoUploadJobs';
import type { VideoUploadBatch } from './videoUploadTypes';

serve({
  upload: async (batch: VideoUploadBatch) => {
    await uploadTryVideos(batch);

    return reply(null);
  },
});
