import { nextPort, openStudio, postJson } from './harness.mjs';

export const MAX_SLOTS_PER_APP = 8;

const workspaceOfEvent = (event) => (typeof event?.workspaceId === 'string' ? event.workspaceId.split('__')[0] : null);

export function slotOf(studio, workspaceId) {
  const onEvent = { current: null };

  return {
    workspaceId,
    studio,
    onEvent,
    api: (method, ...rest) =>
      studio.page.evaluate(([ws, m, a]) => window.__studios[ws][m](...a), [workspaceId, method, rest]),
    call: (kind, payload = {}) => postJson(`${studio.base}/api/bridge/agent-call`, { kind, payload, workspaceId }),
    post: (route, body = {}) => studio.post(route, { ...body, workspaceId }),
  };
}

function routeEvents(studio, slots) {
  const byWorkspace = new Map(slots.map((s) => [s.workspaceId, s]));

  studio.onEvent.current = (event) => byWorkspace.get(workspaceOfEvent(event))?.onEvent.current?.(event);
}

async function waitForWorkspace(page, id) {
  await page.waitForFunction((ws) => !!window.__studios?.[ws], id, { timeout: 60000 });
}

export async function openSlots(studio, count) {
  const wanted = Math.min(count, MAX_SLOTS_PER_APP);
  const { ids } = await studio.page.evaluate(() => window.__studioTabs.list());

  while (ids.length < wanted) {
    const id = await studio.page.evaluate(() => window.__studioTabs.open());

    if (!id) break;

    await waitForWorkspace(studio.page, id);
    ids.push(id);
  }

  for (const id of ids) await waitForWorkspace(studio.page, id);

  const slots = ids.slice(0, wanted).map((id) => slotOf(studio, id));

  routeEvents(studio, slots);

  return slots;
}

export async function openSlotPool({ label, port, parallel, perApp = 1, log }) {
  const each = Math.min(Math.max(1, perApp), MAX_SLOTS_PER_APP);
  const apps = Math.max(1, Math.ceil(parallel / each));
  const state = { port };
  const ports = [];

  for (let i = 0; i < apps; i++) ports.push(await nextPort(state));

  const open = (i) => openStudio({ label: `${label}-${i + 1}`, port: ports[i], log });
  const first = await open(0);
  const rest = await Promise.allSettled(Array.from({ length: apps - 1 }, (_, i) => open(i + 1)));
  const failed = rest.filter((r) => r.status === 'rejected');
  const studios = [first, ...rest.filter((r) => r.status === 'fulfilled').map((r) => r.value)];

  if (failed.length) log(`${failed.length} app copies didn't start (${failed[0].reason?.message}); running with fewer`);

  const slots = (await Promise.all(studios.map((st) => openSlots(st, each)))).flat().slice(0, parallel);
  const close = () => Promise.all(studios.map((st) => st.close()));

  log(`${slots.length} parallel slots in ${apps} app${apps > 1 ? 's' : ''}`);

  return { slots, studios, close };
}

export async function runOnSlots(slots, jobs, fn) {
  const queue = [...jobs];
  const results = [];

  await Promise.all(
    slots.map(async (slot) => {
      for (let job = queue.shift(); job; job = queue.shift()) results.push(await fn(job, slot));
    }),
  );

  return results;
}
