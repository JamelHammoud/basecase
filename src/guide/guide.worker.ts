/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { renderGuideOnPort } from './guidePort';
import type { GuideJob } from './renderGuide';
import { planGuide } from './planGuide';
import { guideStepParts, type GuideStepSettings } from './guideSteps';
import type { ScenePart } from '../types/robotics';
import { rememberItemKeys } from './guideItems';

serve({
  steps: ({ parts, project, keys }: { parts: ScenePart[]; project: GuideStepSettings; keys: string[] }) => {
    rememberItemKeys(parts, keys);

    return reply(guideStepParts(parts, project));
  },
  plan: async (job: Parameters<typeof planGuide>[0]) => reply(await planGuide(job)),
  render: async ({ job, port }: { job: GuideJob; port: MessagePort }) => reply(await renderGuideOnPort(job, port)),
});
