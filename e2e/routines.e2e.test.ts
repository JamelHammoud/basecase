import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TraceEvent } from '../src/routines/scenarioTypes';
import type { Routine } from '../src/routines/schema';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

interface RoutineState {
  routine: Routine | null;
  compiled: { ok: boolean } | null;
  run: { live: boolean; done: boolean; trace: TraceEvent[] } | null;
}

interface Studio {
  load: (record: unknown) => void;
  routineState: () => RoutineState;
  simState: () => { stats: { robots: Array<{ travelled: number }> } | null };
}

const studio = <T>(fn: (s: Studio) => T) =>
  app.page.evaluate(`(${fn.toString()})(window.__studio)`) as Promise<Awaited<T>>;

const routineState = () => studio((s) => s.routineState());

const mainSteps = async () => ((await routineState()).routine?.base.onTimeout ?? []).map((s) => s.id);

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const inFlow = (selector: string) => app.page.locator(visible(`[data-testid="routine-flow"] ${selector}`)).first();

async function loadRover() {
  const robot = fixtureRobots().find((r) => r.id === 'rover-diff')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Routines by hand', () => {
  it('builds a Routine from the empty state, edits it with undo, and runs it', async () => {
    const { page } = app;

    await loadRover();
    await page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Routines"]')).first().click();
    await page.locator(visible('button'), { hasText: 'New Routine' }).first().click();
    await expect.poll(async () => (await routineState()).routine?.requires).toEqual(['wheels']);

    await inFlow('[data-insert]').click();
    await page.getByRole('menuitem', { name: 'Drive' }).click();
    await expect.poll(mainSteps).toEqual(['drive']);

    const distance = page.getByLabel('Distance');

    await distance.fill('2');
    await distance.press('Enter');
    await expect
      .poll(async () => (await routineState()).routine?.base.onTimeout[0])
      .toMatchObject({ move: { distance: 2 } });
    await distance.fill('1');
    await distance.press('Enter');
    await expect
      .poll(async () => (await routineState()).routine?.base.onTimeout[0])
      .toMatchObject({ move: { distance: 1 } });

    await inFlow('button[aria-label="Add step"]:not([data-insert])').click();
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('Drive');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(mainSteps).toEqual(['drive', 'stop']);

    await inFlow('[data-flow-node="stop"]').click();
    await page.keyboard.press('Backspace');
    await expect.poll(mainSteps).toEqual(['drive']);
    await page.locator(visible('button'), { hasText: 'Undo' }).first().click();
    await expect.poll(mainSteps).toEqual(['drive', 'stop']);

    await expect.poll(async () => (await routineState()).compiled?.ok, { timeout: 60000 }).toBe(true);
    await inFlow('button:has-text("Run")').click();
    await expect.poll(async () => (await routineState()).run?.done, { timeout: 90000, interval: 500 }).toBe(true);

    const trace = (await routineState()).run?.trace ?? [];
    const done = trace.filter((e) => e.kind === 'opDone').map((e) => e.node);
    const travelled = (await studio((s) => s.simState())).stats?.robots[0]?.travelled ?? 0;

    expect(done).toEqual(['drive', 'stop']);
    expect(trace.some((e) => e.kind === 'safeStop')).toBe(true);
    expect(travelled).toBeGreaterThan(0.9);
    await expect.poll(() => inFlow('[data-flow-node="drive"]').getAttribute('data-state')).toBe('done');
    expect(app.errors).toEqual([]);
  }, 180000);
});
