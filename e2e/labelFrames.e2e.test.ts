import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import type { FrameSet } from '../src/vision/frameSet';
import { openApp, partCount, shown, type App } from './harness';

interface LabelStudio {
  load: (record: unknown) => void;
  runCase: (id: string) => void;
  referenceTry: () => Promise<void>;
  simState: () => { playing: boolean; tries: unknown[] };
  frameLabels: () => { set: FrameSet | null };
}

type LabelWindow = { __studio: LabelStudio };

let app: App;

beforeAll(async () => {
  app = await openApp();
}, 120000);
afterAll(async () => {
  await app?.close();
});

describe('Frame labels', () => {
  it('extracts pose labels from a reference pick try, draws a box and undoes it', async () => {
    const { page } = app;
    const robot = fixtureRobots().find((entry) => entry.id === 'arm-6dof')!;
    const built = buildCase(
      { goal: 'pick', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!built.ok) throw new Error(built.problem);

    const kase = built.kase;

    await page.evaluate((scene) => (window as unknown as LabelWindow).__studio.load(scene), {
      name: 'Label a pick try',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
    });
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await page.evaluate((id) => (window as unknown as LabelWindow).__studio.runCase(id), kase.id);
    await page.evaluate(() => (window as unknown as LabelWindow).__studio.referenceTry());
    expect(await page.evaluate(() => (window as unknown as LabelWindow).__studio.simState().playing)).toBe(true);
    await expect
      .poll(async () =>
        Number.parseFloat((await page.locator(shown('[data-testid="try-clock"]')).first().textContent()) ?? '0'),
      )
      .toBeGreaterThan(0.1);
    await page.locator(shown('button'), { hasText: 'Stop Try' }).first().click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as LabelWindow).__studio.simState().tries.length))
      .toBe(1);
    await page.getByTestId('try-row').first().click();
    await page.getByTestId('try-timeline').waitFor();
    await page.keyboard.press('Home');
    await page.getByTestId('try-timeline').getByRole('button', { name: 'Add Frames', exact: true }).click();

    const sheet = page.getByRole('dialog', { name: 'Add frames', exact: true });

    await sheet.getByRole('button', { name: 'Add Frames', exact: true }).click();

    const editor = page.getByRole('dialog', { name: 'Frame labels', exact: true });
    const read = () => page.evaluate(() => (window as unknown as LabelWindow).__studio.frameLabels().set);

    await editor.waitFor();

    const set = (await read())!;
    const category = set.classes.find((entry) => entry.objectId === 'block');
    const block = set.frames[0].annotations.find((entry) => entry.classId === category?.id);

    expect(category).toBeDefined();
    expect(block?.instance).toBe('block');
    expect(block?.box[2]).toBeGreaterThan(0);
    expect(block?.box[3]).toBeGreaterThan(0);
    expect(set.frames[0].origin?.frame).toBe(0);

    const before = set.frames[0].annotations;

    await editor.getByRole('button', { name: 'Draw box', exact: true }).click();

    const canvas = editor.getByRole('img', { name: 'Frame labels', exact: true });
    const bounds = (await canvas.boundingBox())!;

    await page.mouse.move(bounds.x + bounds.width * 0.15, bounds.y + bounds.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.5);
    await page.mouse.up();
    await expect.poll(async () => (await read())?.frames[0].annotations.length).toBe(before.length + 1);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect.poll(async () => (await read())?.frames[0].annotations).toEqual(before);
    expect(app.errors).toEqual([]);
  });
});
