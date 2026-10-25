/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { renderThumbnailJob, type ThumbnailJob } from './thumbnailRender';

serve({ render: async (job: ThumbnailJob) => reply(await renderThumbnailJob(job)) });
