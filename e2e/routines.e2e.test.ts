import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TraceEvent } from '../src/routines/scenarioTypes';
import type { Routine } from '../src/routines/schema';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import type { Skill } from '../src/skills/artifacts';
import { modelOf } from '../src/skills/fixtureModels';
import { fixtureMoveSkill, quadWave } from '../src/skills/moveFixtures';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

interface RoutineState {
  routine: Routine | null;
  compiled: { ok: boolean; errors?: Array<{ code: string; path?: string }> } | null;
  run: { live: boolean; done: boolean; trace: TraceEvent[] } | null;
  skills: Array<{ id: string; hash: string }>;
}

interface Studio {
  load: (record: unknown) => void;
  stubHandoffs: (stub: { skills: Skill[]; falls: number }) => void;
  plantHandoff: (from: string, to: string, falls: number) => Promise<void>;
  routineState: () => RoutineState;
  simState: () => { stats: { robots: Array<{ travelled: number }> } | null };
}

const studio = <T>(fn: (s: Studio) => T) =>
  app.page.evaluate(`(${fn.toString()})(window.__studio)`) as Promise<Awaited<T>>;

const routineState = () => studio((s) => s.routineState());

const mainSteps = async () => ((await routineState()).routine?.base.onTimeout ?? []).map((s) => s.id);

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const inFlow = (selector: string) => app.page.locator(visible(`[data-testid="routine-flow"] ${selector}`)).first();

async function loadRobot(id: string) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

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

    await loadRobot('rover-diff');
    await openPlayTab(page, 'Routines');
    await page.locator(visible('button'), { hasText: 'New Routine' }).first().click();
    await expect.poll(async () => (await routineState()).routine?.requires).toEqual(['wheels']);

    await inFlow('button[aria-haspopup="menu"]:not([data-insert])').click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();

    const name = page.getByLabel('Routine name');

    await name.fill('Patrol');
    await name.press('Enter');
    await expect.poll(async () => (await routineState()).routine?.name).toBe('Patrol');

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

    const titleUndo = page.locator('button[aria-label="Undo"]');
    const titleRedo = page.locator('button[aria-label="Redo"]');
    const firstDistance = async () => {
      const step = (await routineState()).routine?.base.onTimeout[0];

      return step && 'move' in step ? step.move?.distance : undefined;
    };

    await distance.fill('0.9');
    await distance.press('Enter');
    await expect.poll(firstDistance).toBe(0.9);
    await expect.poll(() => titleUndo.isEnabled()).toBe(true);
    await titleUndo.click();
    await expect.poll(firstDistance).toBe(1);
    await titleRedo.click();
    await expect.poll(firstDistance).toBe(0.9);
    await inFlow('[data-flow-node="drive"]').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(firstDistance).toBe(1);

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

describe('Hand-offs', () => {
  const refusedAt = async (node: string) =>
    ((await routineState()).compiled?.errors ?? []).some((e) => e.code === 'unproven-transition' && e.path === node);
  const waveHash = async () => (await routineState()).skills.find((s) => s.id === 'wave')?.hash;

  it('proves Walk then Wave, and trains the hand-off when it falls', async () => {
    const { page } = app;
    const quad = fixtureRobots().find((r) => r.id === 'quad-servo')!;
    const wave = fixtureMoveSkill({ model: modelOf(quad), animation: quadWave() });

    await loadRobot('quad-servo');
    await app.page.evaluate(
      (skill) => (window as unknown as { __studio: Studio }).__studio.stubHandoffs({ skills: [skill], falls: 0 }),
      wave,
    );
    await openPlayTab(page, 'Routines');
    await page.locator(visible('button'), { hasText: 'New Routine' }).first().click();
    await inFlow('[data-insert]').click();
    await page.getByRole('menuitem', { name: 'Drive' }).click();
    await expect.poll(mainSteps).toEqual(['drive']);
    await inFlow('button[aria-label="Add step"]:not([data-insert])').click();
    await page.getByRole('menuitem', { name: 'Wave' }).click();
    await expect.poll(mainSteps).toEqual(['drive', 'wave']);
    await expect.poll(() => refusedAt('wave'), { timeout: 60000 }).toBe(true);

    await inFlow('[data-flow-node="wave"] button:has-text("Prove")').click();
    await expect.poll(async () => (await routineState()).compiled?.ok, { timeout: 60000 }).toBe(true);

    const before = await waveHash();

    await studio((s) => s.plantHandoff('walk', 'wave', 3));
    await expect.poll(() => refusedAt('wave'), { timeout: 60000 }).toBe(true);
    await expect
      .poll(() => inFlow('[data-flow-node="wave"]').textContent())
      .toContain('walk to wave fell in 3 of 8 tries in simulation.');
    await inFlow('[data-flow-node="wave"] button:has-text("Train Hand-off")').click();
    await expect.poll(async () => (await routineState()).compiled?.ok, { timeout: 60000 }).toBe(true);
    expect(before).toBeTruthy();
    expect(await waveHash()).not.toBe(before);
    expect(app.errors).toEqual([]);
  }, 180000);
});
