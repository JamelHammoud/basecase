import { UPLOAD_TIMEOUT_MS, fileBlob, httpClient } from './http.mjs';
import {
  displayName,
  finiteOrUndefined,
  minutesFromSeconds,
  statusOrOffline,
  testResult,
  uploadResult,
  withJob,
} from './shared.mjs';

const STATES = {
  IDLE: 'idle',
  READY: 'idle',
  STOPPED: 'idle',
  BUSY: 'preparing',
  PRINTING: 'printing',
  PAUSED: 'paused',
  ATTENTION: 'paused',
  FINISHED: 'finished',
  ERROR: 'failed',
};

const MESSAGES = {
  ATTENTION: 'The printer needs attention. Check the printer screen.',
  ERROR: 'The printer reported an error. Check the printer screen.',
};

const AUTH_MESSAGE = 'Check the API key. It’s on the printer: Settings → Network → PrusaLink.';

export function prusaStatus(status, jobName) {
  const printerState = String(status?.printer?.state ?? '').toUpperCase();
  const state = STATES[printerState] ?? 'idle';
  const job = status?.job ?? {};
  const progress = finiteOrUndefined(job.progress);

  return withJob(state, {
    progress: progress === undefined ? undefined : progress / 100,
    remainingMin: minutesFromSeconds(job.time_remaining),
    job: jobName,
    message: MESSAGES[printerState],
  });
}

function jobNameOf(job) {
  return job?.file?.display_name || job?.file?.name || undefined;
}

export function createPrusaLink(printer, secret) {
  const http = httpClient({
    host: printer.connection?.host,
    headers: secret ? { 'X-Api-Key': secret } : {},
    authMessage: AUTH_MESSAGE,
  });

  const currentJobName = async (status) => {
    if (status?.job?.id === undefined) return undefined;

    try {
      return jobNameOf(await http.call('/api/v1/job'));
    } catch {
      return undefined;
    }
  };

  const jobCommand = async (method, suffix) => {
    const id = (await http.call('/api/v1/status'))?.job?.id;

    if (id === undefined || id === null) throw new Error('No print is running.');

    await http.call(`/api/v1/job/${id}${suffix}`, { method });
  };

  return {
    kind: 'prusalink',
    canStatus: true,
    canStart: true,
    test: () =>
      testResult(async () => {
        const info = await http.call('/api/v1/info');

        return `Connected to ${displayName(printer, info?.hostname || 'PrusaLink')}`;
      }),
    status: () =>
      statusOrOffline(async () => {
        const status = await http.call('/api/v1/status');

        return prusaStatus(status, await currentJobName(status));
      }),
    async send({ file, name, start }) {
      const headers = { 'Content-Type': 'application/octet-stream', Overwrite: '?1' };

      if (start) headers['Print-After-Upload'] = '?1';

      await http.call(`/api/v1/files/usb/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: await fileBlob(file),
        headers,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });

      return uploadResult(name, Boolean(start));
    },
    pause: () => jobCommand('PUT', '/pause'),
    resume: () => jobCommand('PUT', '/resume'),
    cancel: () => jobCommand('DELETE', ''),
    close() {},
  };
}
