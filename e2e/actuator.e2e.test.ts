import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fallBiped, LOADED_BODY_G } from '../src/sim/fixtures/fallBiped';
import type { ScenePart } from '../src/types/robotics';
import { buildCheckPage, sceneRecord, studioLoad, visible, type StudioHook } from './buildCheckFixtures';
import { openApp, partCount, type App } from './harness';

interface ActuatorStudio extends StudioHook {
  bomLines: () => Array<{ key: string; qty: number }>;
  printPlates: () => { open: boolean; plates: string[][] };
}

type Studio = { __studio: ActuatorStudio };

let app: App;

const { checks, checkRow, expand } = buildCheckPage(() => app.page);
const bomLines = () => app.page.evaluate(() => (window as unknown as Studio).__studio.bomLines());
const printPlates = () => app.page.evaluate(() => (window as unknown as Studio).__studio.printPlates());
const kneeItem = () => checkRow('Servo torque').locator('li', { hasText: /Left knee:/ });
const parts = async () => (await sceneRecord(app.page)).parts;
const discIds = (all: ScenePart[]) => all.filter((p) => p.cad && /^Disc /.test(p.name)).map((p) => p.id);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Make an Actuator', () => {
  it('replaces a failing knee servo with a printed cycloidal actuator from its Fix, and undoes it in one step', async () => {
    const biped = fallBiped('c001', LOADED_BODY_G);

    await studioLoad(app.page, {
      parts: biped.parts,
      project: { ...(await sceneRecord(app.page)).project, joints: biped.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(biped.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checkRow('Servo torque');

    await expect.poll(() => row.isVisible(), { timeout: 60000 }).toBe(true);
    await expand(row, 'Servo torque');
    await expect.poll(() => kneeItem().count(), { timeout: 60000 }).toBe(1);
    await kneeItem().getByRole('button', { name: 'Make an Actuator' }).click();

    await expect.poll(async () => (await parts()).some((p) => p.id === 'l_knee_servo'), { timeout: 20000 }).toBe(false);
    await expect.poll(() => kneeItem().count(), { timeout: 60000 }).toBe(0);
    expect(await checks().textContent()).toContain('Servo torque');

    const lines = await bomLines();

    expect(lines.filter((l) => /^component:odrive-d6374\|cycloidal-/.test(l.key)).map((l) => l.qty)).toEqual([1]);
    expect(lines.some((l) => /^component:mjbots-moteus-/.test(l.key))).toBe(true);
    expect(lines.some((l) => l.key === 'component:adafruit-as5600')).toBe(true);

    const discs = discIds(await parts());

    expect(discs).toHaveLength(2);
    await app.page.keyboard.press('Meta+p');
    await expect
      .poll(async () => (await printPlates()).plates.flat(), { timeout: 30000 })
      .toEqual(expect.arrayContaining(discs));
    await app.page.keyboard.press('Escape');
    await expect.poll(async () => (await printPlates()).open).toBe(false);

    await app.page.keyboard.press('Meta+z');
    await expand(checkRow('Servo torque'), 'Servo torque');
    await expect.poll(async () => (await parts()).map((p) => p.id).sort()).toEqual(biped.parts.map((p) => p.id).sort());
    expect((await sceneRecord(app.page)).project.joints?.find((j) => j.id === 'l_knee')?.actuators).toEqual([
      'l_knee_servo',
    ]);
    await expect.poll(() => kneeItem().count(), { timeout: 60000 }).toBe(1);
  }, 180000);
});
