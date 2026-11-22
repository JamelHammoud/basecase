/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { renderGuideOnPort } from './guidePort';
import type { GuideJob } from './renderGuide';
import { planGuide } from './planGuide';

serve({
  plan: async (job: Parameters<typeof planGuide>[0]) => reply(await planGuide(job)),
  render: async ({ job, port }: { job: GuideJob; port: MessagePort }) => reply(await renderGuideOnPort(job, port)),
});
