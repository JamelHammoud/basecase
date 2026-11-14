import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildCheckPage, sceneRecord, studioLoad, visible } from './buildCheckFixtures';
import { openApp, partCount, type App } from './harness';

let app: App;

const { checkRow } = buildCheckPage(() => app.page);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

interface TimeCheck {
  status: string;
  detail: string;
}

const timeCheck = () =>
  app.page.evaluate(
    () => (window as unknown as { __studio: { timeCheck: () => TimeCheck | undefined } }).__studio.timeCheck() ?? null,
  );

const minutesOf = (detail: string) => {
  const [, h, m] = detail.match(/^≈ (?:(\d+) h )?(\d+) min/) ?? [];

  return Number(h ?? 0) * 60 + Number(m ?? 0);
};

async function setHours(hours: number) {
  const field = app.page.locator(visible('input[aria-label="Budget in hours"]')).first();

  await field.click();
  await field.fill(String(hours));
  await field.press('Enter');
}

describe('Time budget', () => {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

  it('fails the rover over a 1 h budget, drops when a printed part goes, and passes a raised budget', async () => {
    await studioLoad(app.page, {
      parts: rover.parts,
      project: { ...(await sceneRecord(app.page)).project, joints: rover.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(rover.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await setHours(1);

    const row = checkRow('Time');

    await expect.poll(() => row.getAttribute('data-status'), { timeout: 60000 }).toBe('fail');

    const before = minutesOf((await timeCheck())!.detail);

    const { project } = await sceneRecord(app.page);

    await studioLoad(app.page, {
      parts: rover.parts.filter((p) => p.id !== 'caster_wheel_disc'),
      project: { ...project, joints: rover.joints.filter((j) => j.id !== 'caster_wheel') },
    });
    await expect.poll(() => partCount(app.page)).toBe(rover.parts.length - 1);
    await expect
      .poll(async () => minutesOf((await timeCheck())?.detail ?? ''), { timeout: 60000 })
      .toBeLessThan(before);

    await setHours(100);
    await expect.poll(() => row.getAttribute('data-status'), { timeout: 60000 }).toBe('pass');
    expect(app.errors).toEqual([]);
  }, 180000);
});
