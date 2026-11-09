import { isPolicySpec } from '../sim/policy';
import type { ForgeJob, ForgeOutcome, ForgeRunner } from '../skills/forgeRunner';
import type { ForgeEvent } from './forgeWasm';
import type { ForgeTabMessage, ForgeTabRequest } from './forgeTab.worker';

export interface TabForgeOptions {
  onEvent?: (event: ForgeEvent) => void;
  signal?: AbortSignal;
}

const failure = (stderr: string, events: object[] = []): ForgeOutcome => ({ ok: false, policy: null, events, stderr });

function finished(result: Record<string, unknown>, events: object[], run: string): ForgeOutcome {
  const policy = { ...(result.policy as object), createdAt: new Date().toISOString().slice(0, 19) };

  if (!isPolicySpec(policy)) return failure('Forge saved no policy.', events);

  events.push({ type: 'done', steps: result.steps, stopped: result.stopped, policy: run });

  return { ok: true, policy, events, stderr: '', run };
}

export function tabForge(options: TabForgeOptions = {}): ForgeRunner {
  const resumes = new Map<string, string>();
  let runs = 0;

  return (job: ForgeJob) => {
    const warmKey = typeof job.job.warmStart === 'string' ? job.job.warmStart : null;
    const warm = warmKey ? resumes.get(warmKey) : null;

    if (warmKey && !warm) return Promise.resolve(failure(`This tab has no run ${warmKey} to continue from.`));

    const worker = new Worker(new URL('./forgeTab.worker.ts', import.meta.url), { type: 'module' });
    const events: object[] = [];
    const request: ForgeTabRequest = { type: 'train', xml: job.xml, job: job.job, warm: warm ?? null };

    return new Promise<ForgeOutcome>((resolve) => {
      options.signal?.addEventListener('abort', () => worker.postMessage({ type: 'stop' } satisfies ForgeTabRequest));
      worker.onerror = (e) => resolve(failure(e.message || 'Forge’s worker stopped.', events));
      worker.onmessage = (ev: MessageEvent<ForgeTabMessage>) => {
        const msg = ev.data;

        if (msg.type === 'event') {
          events.push(msg.event);
          options.onEvent?.(msg.event);

          return;
        }

        if (msg.type === 'error') {
          resolve(failure(msg.message, events));

          return;
        }

        const run = `tab-run-${++runs}`;

        resumes.set(run, String(msg.result.resume));
        resolve(finished(msg.result, events, run));
      };
      worker.postMessage(request);
    }).finally(() => worker.terminate());
  };
}
