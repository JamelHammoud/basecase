import { UPLOAD_TIMEOUT_MS, httpClient, uploadForm } from './http.mjs';
import {
  displayName,
  finiteOrUndefined,
  minutesFromSeconds,
  statusOrOffline,
  testResult,
  uploadResult,
  withJob,
} from './shared.mjs';

const STATES = [
  [/^(offline after error|error)/i, 'failed'],
  [/^(offline|closed)/i, 'offline'],
  [/^paus/i, 'paused'],
  [/^(printing|finishing|cancelling|resuming)/i, 'printing'],
  [/^(starting|connecting|opening|detecting|transferring)/i, 'preparing'],
];

const AUTH_MESSAGE = 'Check the API key. Create one in OctoPrint: Settings → Application Keys.';

const OFFLINE_MESSAGE = 'OctoPrint isn’t connected to the printer. Connect it in OctoPrint.';

function octoState(text, completion) {
  const match = STATES.find(([pattern]) => pattern.test(text));

  if (match) return match[1];

  return completion >= 100 ? 'finished' : 'idle';
}

function failureMessage(text, error) {
  const detail = error || text;

  return `${detail.replace(/\.$/, '')}. Check the printer, then reconnect it in OctoPrint.`;
}

function jobName(data) {
  const file = data?.job?.file;

  return file?.display || file?.name || undefined;
}

export function octoprintStatus(data) {
  const text = String(data?.state ?? '');
  const completion = finiteOrUndefined(data?.progress?.completion);
  const state = octoState(text, completion);

  if (state === 'offline') return { state, message: OFFLINE_MESSAGE };

  return withJob(state, {
    progress: completion === undefined ? undefined : completion / 100,
    remainingMin: minutesFromSeconds(data?.progress?.printTimeLeft),
    job: jobName(data),
    message: state === 'failed' ? failureMessage(text, data?.error) : undefined,
  });
}

export function createOctoPrint(printer, secret) {
  const http = httpClient({
    host: printer.connection?.host,
    headers: secret ? { 'X-Api-Key': secret } : {},
    authMessage: AUTH_MESSAGE,
  });

  const jobCommand = async (body) => {
    await http.call('/api/job', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    kind: 'octoprint',
    canStatus: true,
    canStart: true,
    test: () =>
      testResult(async () => {
        await http.call('/api/version');

        return `Connected to ${displayName(printer, 'OctoPrint')}`;
      }),
    status: () => statusOrOffline(async () => octoprintStatus(await http.call('/api/job'))),
    async send({ file, name, start }) {
      const fields = start ? { select: 'true', print: 'true' } : {};
      const body = await uploadForm({ file, name, fields });
      const data = await http.call('/api/files/local', { method: 'POST', body, timeoutMs: UPLOAD_TIMEOUT_MS });

      return uploadResult(name, Boolean(start) && data?.done !== false);
    },
    pause: () => jobCommand({ command: 'pause', action: 'pause' }),
    resume: () => jobCommand({ command: 'pause', action: 'resume' }),
    cancel: () => jobCommand({ command: 'cancel' }),
    close() {},
  };
}
