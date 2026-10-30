import { UPLOAD_TIMEOUT_MS, httpClient, uploadForm } from './http.mjs';
import { displayName, finiteOrUndefined, statusOrOffline, testResult, uploadResult, withJob } from './shared.mjs';

const STATES = {
  standby: 'idle',
  printing: 'printing',
  paused: 'paused',
  complete: 'finished',
  cancelled: 'idle',
  error: 'failed',
};

const STATUS_ROUTE = '/printer/objects/query?print_stats&virtual_sdcard&display_status';

const AUTH_MESSAGE = 'Check the API key. Find it in Mainsail or Fluidd: Settings → Authorization.';

function remainingMinutes(progress, duration) {
  const measurable = progress > 0.01 && duration > 0;

  if (!measurable) return undefined;

  return Math.round((duration / progress - duration) / 60);
}

export function moonrakerStatus(status) {
  const stats = status?.print_stats ?? {};
  const state = STATES[stats.state] ?? 'idle';
  const progress = finiteOrUndefined(status?.virtual_sdcard?.progress ?? status?.display_status?.progress);

  return withJob(state, {
    progress,
    layer: finiteOrUndefined(stats.info?.current_layer),
    totalLayers: finiteOrUndefined(stats.info?.total_layer),
    remainingMin: remainingMinutes(progress, Number(stats.print_duration)),
    job: stats.filename || undefined,
    message: state === 'failed' ? stats.message || 'Klipper stopped the print. Check the printer.' : undefined,
  });
}

export function createMoonraker(printer, secret) {
  const http = httpClient({
    host: printer.connection?.host,
    headers: secret ? { 'X-Api-Key': secret } : {},
    authMessage: AUTH_MESSAGE,
  });

  const command = async (name) => {
    await http.call(`/printer/print/${name}`, { method: 'POST' });
  };

  return {
    kind: 'moonraker',
    canStatus: true,
    canStart: true,
    test: () =>
      testResult(async () => {
        const info = (await http.call('/server/info'))?.result ?? {};

        if (info.klippy_state && info.klippy_state !== 'ready') {
          throw new Error('Moonraker answered, but Klipper isn’t ready. Check the printer, then try again.');
        }

        return `Connected to ${displayName(printer, 'Klipper')}`;
      }),
    status: () => statusOrOffline(async () => moonrakerStatus((await http.call(STATUS_ROUTE))?.result?.status)),
    async send({ file, name, start }) {
      const body = await uploadForm({ file, name, fields: start ? { print: 'true' } : {} });
      const data = await http.call('/server/files/upload', { method: 'POST', body, timeoutMs: UPLOAD_TIMEOUT_MS });
      const result = data?.result ?? data;

      return uploadResult(name, Boolean(start) && result?.print_started !== false);
    },
    pause: () => command('pause'),
    resume: () => command('resume'),
    cancel: () => command('cancel'),
    close() {},
  };
}
