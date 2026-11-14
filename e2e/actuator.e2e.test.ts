import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOADED_BIPED_BODY_G } from '../src/sim/fixtures/fallBiped';
import { buildCheckPage, sceneRecord, visible } from './buildCheckFixtures';
import { loadFallBiped } from './fallsFixtures';
import { openApp, type App } from './harness';

interface Studio {
  bomLines: () => Array<{ key: string; qty: number }>;
  printPlates: () => { open: boolean; plates: string[][] };
}

let app: App;

const { checkRow, expand } = buildCheckPage(() => app.page);
const bomLines = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bomLines());
const printPlates = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates());
const torqueRow = () => checkRow('Servo torque');
const kneeJoint = async () => (await sceneRecord(app.page)).project.joints?.find((j) => j.id === 'l_knee');
const rowText = async () => {
  await expand(torqueRow(), 'Servo torque');

  return (await torqueRow().textContent()) ?? '';
};

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Make an Actuator', () => {
  it('replaces the loaded biped’s failing knee servo from its Servo torque Fix, and undo brings it back', async () => {
    await loadFallBiped(app.page, LOADED_BIPED_BODY_G);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(rowText, { timeout: 60000 }).toMatch(/Left knee:/);

    await torqueRow()
      .locator('li', { hasText: /Left knee:/ })
      .getByRole('button', { name: 'Make an Actuator' })
      .click();
    await expect.poll(async () => (await kneeJoint())?.actuators?.[0], { timeout: 30000 }).toMatch(/-motor$/);

    const { parts } = await sceneRecord(app.page);
    const knee = await kneeJoint();
    const motor = parts.find((p) => p.id === knee?.actuators?.[0]);
    const discs = parts.filter((p) => /^Disc [AB]$/.test(p.name)).map((p) => p.id);

    expect(parts.some((p) => p.id === 'l_knee_servo')).toBe(false);
    expect(motor?.componentId).toBe('odrive-d6374');
    expect(discs).toHaveLength(2);
    await expect
      .poll(
        async () => {
          const text = await rowText();

          return /Right knee:/.test(text) && !/Left knee:/.test(text);
        },
        { timeout: 60000 },
      )
      .toBe(true);

    const motors = (await bomLines()).filter((l) => l.key.startsWith('component:odrive-d6374|cycloidal-'));

    expect(motors.map((l) => l.qty)).toEqual([1]);

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect
      .poll(async () => (await printPlates()).plates.flat(), { timeout: 30000 })
      .toEqual(expect.arrayContaining(discs));
    await app.page.keyboard.press('Escape');
    await expect.poll(async () => (await printPlates()).open).toBe(false);

    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await kneeJoint())?.actuators).toEqual(['l_knee_servo']);
    expect((await sceneRecord(app.page)).parts.some((p) => p.id === 'l_knee_servo')).toBe(true);
    await expect.poll(rowText, { timeout: 60000 }).toMatch(/Left knee:/);
  }, 240000);
});
