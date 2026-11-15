import { expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { presetCase } from '../src/cases/testing';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount } from './harness';

interface Trail {
  seed: number;
  passed: boolean;
  firstTrip: { label: string; frame: number } | null;
  points: Array<{ x: number; y: number; visible: boolean }>;
}

type Studio = {
  load: (record: unknown) => void;
  caseTrails: () => Trail[];
  simState: () => {
    status: string;
    world: string[];
    guests: string[];
    tries: unknown[];
    timeline: { seed: number; frame: number; sought: number | null } | null;
  };
};

it('opens all 20 seeded trails from Checks and replays a failed seed at its first trip', async () => {
  const app = await openApp();

  try {
    const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
    const joints = rover.joints.map((j) => ({ ...j, effortNm: 0.075 }));
    const kase = presetCase(rover, 'reach-the-flag');
    const trails = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseTrails());
    const timeline = () =>
      app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().timeline);

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      parts: rover.parts,
      project: { ...DEFAULT_PROJECT, joints, cases: [kase] },
    });
    await expect.poll(() => partCount(app.page)).toBe(rover.parts.length);
    await app.page.locator('[role=tab]:not([inert] *):visible', { hasText: 'Build' }).first().click();

    const row = app.page.locator('#case-check-reach-a-spot:visible');

    await expect.poll(() => row.textContent()).toMatch(/of 20$/);
    await row.click();
    await expect.poll(async () => (await trails()).length).toBe(20);

    const before = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
    const shown = await trails();
    const failed = shown.find((t) => !t.passed && t.firstTrip && t.points.some((p) => p.visible))!;

    expect(failed).toBeDefined();

    const point = failed.points.findLast((p) => p.visible)!;

    await app.page.mouse.click(point.x, point.y);
    await expect.poll(timeline).not.toBeNull();

    const opened = (await timeline())!;
    const clicked = shown.find((t) => t.seed === opened.seed)!;

    expect(opened.seed).toBe(failed.seed);
    expect(clicked.passed).toBe(false);
    expect(opened.frame).toBe(clicked.firstTrip!.frame);
    await expect.poll(async () => (await timeline())?.sought).toBe(clicked.firstTrip!.frame);
    await app.page.keyboard.press('Escape');
    await expect.poll(timeline).toBeNull();

    const after = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

    expect(after.status).toBe(before.status);
    expect(after.world).toEqual(before.world);
    expect(after.guests).toEqual(before.guests);
    expect(after.tries).toEqual(before.tries);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
