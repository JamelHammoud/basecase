import { checkedStepJob, checkedStepReply } from './stepPolicy.mjs';

export const NO_STEP_KERNEL_ERROR = 'The CAD kernel runs in the desktop app. Open this scene there to export STEP.';

export async function exportStepFile(kernel, payload) {
  if (typeof kernel?.exportStep !== 'function') throw new Error(NO_STEP_KERNEL_ERROR);

  const job = checkedStepJob(payload);

  return checkedStepReply(await kernel.exportStep(job), job.bodies.length);
}
