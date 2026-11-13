import type { ForgeOutcome } from './forgeRunner';
import type { SkillsMessage } from './skills.worker';
import type { ReplyTo, SkillPorts, SkillsJob } from './skillsJob';
import { errorMessage } from '../utils/errorMessage';

export type SkillRunner = <K extends SkillsJob['type']>(
  job: Extract<SkillsJob, { type: K }>,
  ports: SkillPorts,
) => Promise<ReplyTo<K>>;

export const STOPPED = 'Stopped.';

const failed = (e: unknown): ForgeOutcome => ({
  ok: false,
  policy: null,
  events: [],
  stderr: errorMessage(e),
});

function answer(worker: Worker, msg: SkillsMessage, ports: SkillPorts) {
  if (msg.type === 'forge') {
    void ports
      .forge(msg.job)
      .catch(failed)
      .then((outcome) => worker.postMessage({ type: 'forge-result', call: msg.call, outcome }));

    return true;
  }

  if (msg.type === 'save') {
    void ports
      .save(msg.path, msg.text)
      .then(
        () => null,
        (e: unknown) => errorMessage(e),
      )
      .then((error) => worker.postMessage({ type: 'save-result', call: msg.call, error }));

    return true;
  }

  return false;
}

export const inSkillsWorker: SkillRunner = (job, ports) => {
  const worker = new Worker(new URL('./skills.worker.ts', import.meta.url), { type: 'module' });

  return new Promise<ReplyTo<typeof job.type>>((resolve, reject) => {
    if (ports.signal?.aborted) reject(new Error(STOPPED));

    ports.signal?.addEventListener('abort', () => reject(new Error(STOPPED)), { once: true });
    worker.onmessage = (ev: MessageEvent<SkillsMessage>) => {
      const msg = ev.data;

      if (answer(worker, msg, ports)) return;

      if (msg.type === 'error') reject(new Error(msg.message));
      else resolve(msg as ReplyTo<typeof job.type>);
    };
    worker.onerror = (e) => reject(new Error(e.message || 'The skills worker stopped.'));
    worker.postMessage(job);
  }).finally(() => worker.terminate()) as never;
};
