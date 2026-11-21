import { reply, serve } from '../../utils/workerRpc';
import { renderCompositionJob, type CompositionJob } from './render';

serve({ render: async (job: CompositionJob) => reply(await renderCompositionJob(job)) });
