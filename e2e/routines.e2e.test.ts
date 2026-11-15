import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Routine, SkillContract } from '../src/routines/schema';
import { FIXTURE_SKILLS } from '../src/routines/fixtureSkills';
import { loadKitLibrary } from '../src/routines/kitLibrary';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import type { Skill } from '../src/skills/artifacts';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

interface RoutineState {
  routine: Routine | null;
  compiled: { ok: boolean; errors?: Array<{ code: string; path?: string }> } | null;
  run: { live: boolean } | null;
}

interface Studio {
  load: (record: unknown) => void;
  stubHandoffs: (stub: { skills: Skill[]; falls: number; kit?: readonly SkillContract[] }) => void;
  routineState: () => RoutineState;
}

const studio = <T>(fn: (s: Studio) => T) =>
  app.page.evaluate(`(${fn.toString()})(window.__studio)`) as Promise<Awaited<T>>;

const routineState = () => studio((s) => s.routineState());

const mainSteps = async () => ((await routineState()).routine?.base.onTimeout ?? []).map((s) => s.id);

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const inFlow = (selector: string) => app.page.locator(visible(`[data-testid="routine-flow"] ${selector}`)).first();

function failedKitPair(kit: readonly SkillContract[], pair: { from: string; to: string; reason: string }) {
  return kit.map((skill) =>
    skill.id === pair.from
      ? {
          ...skill,
          transitions: {
            ...skill.transitions,
            [pair.to]: { ...skill.transitions[pair.to], failures: 8, reason: pair.reason },
          },
        }
      : skill,
  );
}

async function loadRobot(id: string) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

async function createRoutineWithDrive() {
  const { page } = app;

  await loadRobot('rover-diff');
  await openPlayTab(page, 'Routines');
  await page.locator(visible('button'), { hasText: 'New Routine' }).first().click();
  await expect.poll(async () => (await routineState()).routine?.requires).toEqual(['wheels']);
  await inFlow('[data-insert]').click();
  await page.getByRole('menuitem', { name: 'Drive' }).click();
  await expect.poll(mainSteps).toEqual(['drive']);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Routines by hand', () => {
  it('renames a Routine and adds and deletes a step through the keyboard', async () => {
    const { page } = app;

    await createRoutineWithDrive();
    await inFlow('button[aria-haspopup="menu"]:not([data-insert])').click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByLabel('Routine name').fill('Patrol');
    await page.getByLabel('Routine name').press('Enter');
    await expect.poll(async () => (await routineState()).routine?.name).toBe('Patrol');
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
    expect(app.errors).toEqual([]);
  });

  it('undoes field edits through the title bar and keyboard', async () => {
    const { page } = app;
    const titleUndo = page.locator('button[aria-label="Undo"]');
    const titleRedo = page.locator('button[aria-label="Redo"]');
    const firstDistance = async () => {
      const step = (await routineState()).routine?.base.onTimeout[0];

      return step && 'move' in step ? step.move?.distance : undefined;
    };

    await createRoutineWithDrive();
    await expect.poll(firstDistance).toBe(1);
    await page.getByLabel('Distance').fill('0.9');
    await page.getByLabel('Distance').press('Enter');
    await expect.poll(firstDistance).toBe(0.9);
    await expect.poll(() => titleUndo.isEnabled()).toBe(true);
    await titleUndo.click();
    await expect.poll(firstDistance).toBe(1);
    await titleRedo.click();
    await expect.poll(firstDistance).toBe(0.9);
    await inFlow('[data-flow-node="drive"]').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(firstDistance).toBe(1);
    expect(app.errors).toEqual([]);
  });
});

describe('Hand-offs', () => {
  const refusedAt = async (node: string) =>
    ((await routineState()).compiled?.errors ?? []).some((e) => e.code === 'unproven-transition' && e.path === node);

  it('keeps Settle then Turn then Walk unavailable until the candidate passes its hand-offs', async () => {
    const { page } = app;
    const library = await loadKitLibrary();
    const candidate = library.find((skill) => skill.name === 'Velocity tracking')!;
    const kit = FIXTURE_SKILLS.map((skill) => ({
      ...skill,
      transitions: Object.fromEntries(
        Object.entries(skill.transitions).map(([to, proof]) => [to, { ...proof, failures: 0 }]),
      ),
    }));
    const failed = failedKitPair(kit, {
      from: 'settle',
      to: 'turn-away',
      reason: 'settle to turn-away didn’t turn left 0.3 rad in place in 8 of 8 tries in simulation.',
    });

    expect(candidate.evidence?.passed).toBe(true);
    await loadRobot('quad-servo');
    await page.evaluate((stub) => (window as unknown as { __studio: Studio }).__studio.stubHandoffs(stub), {
      skills: [candidate],
      falls: 0,
      kit: failed,
    });
    await openPlayTab(page, 'Routines');
    await page.locator(visible('button'), { hasText: 'New Routine' }).first().click();
    await inFlow('[data-insert]').click();
    await page.getByRole('menuitem', { name: 'Turn', exact: true }).click();
    await inFlow('button[aria-label="Add step"]:not([data-insert])').click();
    await page.getByRole('menuitem', { name: 'Drive', exact: true }).click();
    await expect.poll(mainSteps).toEqual(['turn', 'drive']);
    await expect.poll(() => refusedAt('turn')).toBe(true);
    expect(await inFlow('button:has-text("Run")').count()).toBe(0);
    expect(await inFlow('[data-flow-node="turn"]').textContent()).toContain('turn left 0.3 rad in place');

    const failedStop = failedKitPair(kit, {
      from: 'walk',
      to: 'settle',
      reason: 'walk to settle didn’t stop within 0.02 m in 8 of 8 tries in simulation.',
    });

    await page.evaluate((stub) => (window as unknown as { __studio: Studio }).__studio.stubHandoffs(stub), {
      skills: [candidate],
      falls: 0,
      kit: failedStop,
    });
    await expect.poll(() => refusedAt('drive')).toBe(true);
    expect(await inFlow('button:has-text("Run")').count()).toBe(0);
    expect(await inFlow('[data-flow-node="drive"]').textContent()).toContain('stop within 0.02 m');

    const passing = structuredClone(candidate);

    if (passing.controller.kind !== 'policy') throw new Error('Missing fixture policy');

    passing.controller.policy.trainedSteps += 1;
    await page.evaluate((stub) => (window as unknown as { __studio: Studio }).__studio.stubHandoffs(stub), {
      skills: [passing],
      falls: 0,
      kit,
    });
    await expect.poll(async () => (await routineState()).compiled?.ok).toBe(true);
    await inFlow('button:has-text("Run")').click();
    await expect.poll(async () => (await routineState()).run?.live).toBe(true);
    expect(app.errors).toEqual([]);
  });
});
