/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { renderGuideOnPort } from './guidePort';
import type { GuideJob } from './renderGuide';

serve({
  render: async ({ job, port }: { job: GuideJob; port: MessagePort }) => reply(await renderGuideOnPort(job, port)),
});
