export const ACCESS_CODE_MESSAGE = 'Check the access code on the printer: Settings → LAN Only.';

export function unreachableMessage(host) {
  return `Couldn’t reach the printer at ${host}. Check it’s on and on the same network.`;
}

export function displayName(printer, fallback) {
  return printer?.nickname || fallback;
}

export function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

export function withJob(state, details) {
  if (state === 'idle' || state === 'offline') return compact({ state, message: details.message });

  return compact({ state, ...details });
}

export function finiteOrUndefined(value) {
  const number = Number(value);

  return value !== null && value !== '' && Number.isFinite(number) ? number : undefined;
}

export function minutesFromSeconds(seconds) {
  const value = finiteOrUndefined(seconds);

  return value === undefined || value < 0 ? undefined : Math.round(value / 60);
}

export async function testResult(run) {
  try {
    return { ok: true, message: await run() };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export async function statusOrOffline(run) {
  try {
    return await run();
  } catch (error) {
    return { state: 'offline', message: error.message };
  }
}

export function uploadResult(name, started) {
  return { started, message: started ? `Started ${name}` : `Uploaded ${name}` };
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
