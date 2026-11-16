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

function acknowledge(
  worker: Worker,
  reply: { type: 'save-result' | 'selection-result'; call: number },
  work: Promise<unknown>,
) {
  void work
    .then(
      () => null,
      (error: unknown) => errorMessage(error),
    )
    .then((error) => worker.postMessage({ ...reply, error }));
}

function answer(worker: Worker, msg: SkillsMessage, ports: SkillPorts) {
  if (msg.type === 'progress') {
    ports.progress?.(msg.share);

    return true;
  }

  if (msg.type === 'forge') {
    void ports
      .forge(msg.job)
      .catch(failed)
      .then((outcome) => worker.postMessage({ type: 'forge-result', call: msg.call, outcome }));

    return true;
  }

  if (msg.type === 'save') {
    acknowledge(worker, { type: 'save-result', call: msg.call }, ports.save(msg.path, msg.text));

    return true;
  }

  if (msg.type === 'seed-selection') {
    acknowledge(
      worker,
      { type: 'selection-result', call: msg.call },
      Promise.resolve(ports.forge.selected?.(msg.selection)),
    );

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
    worker.postMessage({ ...job, localSalt: ports.localSalt });
  }).finally(() => worker.terminate()) as never;
};
