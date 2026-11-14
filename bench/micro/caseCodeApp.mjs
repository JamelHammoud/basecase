import { AdapterMissing } from './adapterMissing.mjs';
import { codePanelsIn } from './caseCodeChecks.mjs';

const LOAD_MS = 15000;
const SETTLE_MS = 2000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(read, ok, ms) {
  const end = Date.now() + ms;
  let value = await read();

  while (!ok(value) && Date.now() < end) {
    await sleep(200);
    value = await read();
  }

  return value;
}

const locate = (frame, want) =>
  want.text
    ? frame.getByText(want.text)
    : frame.getByRole(want.role, { name: want.name, exact: typeof want.name === 'string' });

const FIND_MS = 5000;

async function firstIn(frames, want) {
  for (const frame of frames) {
    const found = locate(frame, want);

    if (await found.count()) return found.first();
  }

  return null;
}

const finder = (frames) => async (want) => {
  const end = Date.now() + FIND_MS;
  let found = await firstIn(frames, want);

  while (!found && Date.now() < end) {
    await sleep(250);
    found = await firstIn(frames, want);
  }

  return found;
};

export async function runCodeApp(ctx, kase) {
  const { page, studio } = ctx.app ?? {};

  if (!page || !studio) throw new AdapterMissing('codeApp', 'the running app’s page');

  const panels = codePanelsIn(kase);
  const settled = (reports) => panels.every((p) => reports?.[p.id]?.loaded || reports?.[p.id]?.failed);

  await studio('runCase', kase.id);
  await until(() => studio('codeReports'), settled, LOAD_MS);
  await sleep(SETTLE_MS);

  const frames = panels.map((p) => page.frameLocator(`[data-code-panel="${p.id}"]`));
  const find = finder(frames);
  const controls = [];

  for (const want of ctx.task.controls) controls.push({ ...want, found: !!(await find(want)) });

  const io = { page, frames, find, sample: () => studio('simState'), sleep, until };
  const sim = ctx.task.sim
    ? await ctx.task.sim(io).catch((err) => ({ pass: false, detail: String(err?.message ?? err) }))
    : null;
  const reports = await studio('codeReports');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  return { reports, controls, sim };
}
