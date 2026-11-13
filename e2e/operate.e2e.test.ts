import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../src/types/robotics';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const block = (id: string, y: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 40, depth: 40 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  massG: 60,
  ...extra,
});

const servo = (id: string, y: number) =>
  block(id, y, { componentId: 'feetech-sts3215', componentVariant: 'c001', massG: 55 });

const joint = (id: string, parent: string[], child: string[], y: number): RobotJoint => ({
  id,
  name: id === 'shoulder' ? 'Shoulder' : 'Elbow',
  type: 'revolute',
  parent,
  child,
  origin: [0, y, 0],
  axis: [1, 0, 0],
  actuators: [parent[1]],
  limb: 'arm',
});

const ARM = {
  name: 'arm',
  parts: [
    block('base', 20),
    servo('shoulder-servo', 70),
    block('upper', 130),
    servo('elbow-servo', 190),
    block('fore', 250),
  ],
  project: {
    ...DEFAULT_PROJECT,
    joints: [
      joint('shoulder', ['base', 'shoulder-servo'], ['upper', 'elbow-servo'], 70),
      joint('elbow', ['upper', 'elbow-servo'], ['fore'], 190),
    ],
  },
};

const row = (id: string) => app.page.locator(visible(`[data-calibration-joint="${id}"]`)).first();

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

interface Ghost {
  layer: { parts: Record<string, number[]>; values: Record<string, number>; label: string | null } | null;
  measured: Record<string, number | null> | null;
  sim: Record<string, number | null> | null;
  largest: { joint: string; degrees: number } | null;
}

const ghost = () =>
  app.page.evaluate(() => (window as unknown as { __studio: { robotGhost: () => Ghost } }).__studio.robotGhost());

const simDrive = () =>
  app.page.evaluate(
    () => (window as unknown as { __studio: { simState: () => { drive: string } } }).__studio.simState().drive,
  );

async function climbToTest() {
  const { page } = app;

  await openPlayTab(page, 'Operate');

  if (await button(/^Disconnect$/).count()) await button(/^Disconnect$/).click();

  await button('Connect Emulated Robot').click();
  await page.locator(visible('[data-robot-rung="set_up"]')).first().click();
  await expect
    .poll(() => page.locator(visible('[data-testid="robot-mode"]')).first().getAttribute('data-mode'))
    .toBe('set_up');
  await page.locator(visible('[data-robot-rung="test"]')).first().click();
  await expect
    .poll(() => page.locator(visible('[data-testid="robot-mode"]')).first().getAttribute('data-mode'))
    .toBe('test');
}

const spread = (g: Ghost) =>
  Math.max(...Object.keys(g.measured ?? {}).map((id) => Math.abs((g.measured?.[id] ?? 0) - (g.sim?.[id] ?? 0))));

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as { __studio: { attachRobot: (link: unknown) => void }; __fakeRobotLink: unknown };

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate(
    (record) => (window as unknown as { __studio: { load: (r: unknown) => void } }).__studio.load(record),
    ARM,
  );
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(ARM.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate calibration', () => {
  it.skipIf(process.platform === 'win32')(
    'calibrates every joint of the emulated arm, replays one and rolls it back',
    async () => {
      const { page } = app;

      await climbToTest();

      expect(
        await page.locator(visible('[data-testid="robot-mode"]')).first().locator('[data-robot-rung]').count(),
      ).toBe(7);

      const calibrate = page
        .locator(visible('[data-testid="robot-calibration"] button'), { hasText: 'Calibrate Servos' })
        .first();

      await expect.poll(() => calibrate.isEnabled()).toBe(true);
      await calibrate.click();
      await expect
        .poll(() => page.locator(visible('[data-testid="robot-calibration"]')).first().getAttribute('data-calibrating'))
        .not.toBe('idle');

      for (const id of ['shoulder', 'elbow'])
        await expect
          .poll(() => row(id).getAttribute('data-verdict'), { timeout: 90000 })
          .toMatch(/^(measured|consistent)$/);

      expect(await row('shoulder').getAttribute('data-robot-joint')).toBe('1');
      expect(await row('elbow').getAttribute('data-robot-joint')).toBe('2');
      await expect.poll(async () => Number(await row('elbow').getAttribute('data-position'))).toBeGreaterThan(0);
      expect(await row('elbow').textContent()).toContain('Elbow');

      const measured = page.locator(visible('[data-calibration-joint][data-verdict="measured"]')).first();
      const jointId = (await measured.getAttribute('data-calibration-joint')) ?? '';

      expect(Number(await row(jointId).getAttribute('data-version'))).toBe(1);
      await row(jointId).locator('button').first().click();

      const replay = page.locator(visible('[data-testid="joint-replay"]')).first();
      const trace = (id: string) => replay.locator(`[data-testid="trace-${id}"]`);

      for (const id of ['logged', 'preset', 'calibration'])
        await expect.poll(() => trace(id).count(), { timeout: 60000 }).toBe(1);

      const errors = await page.evaluate(
        (id) =>
          (
            window as unknown as {
              __studio: { calibrationReplay: (id: string) => Promise<Record<string, number | null> | null> };
            }
          ).__studio.calibrationReplay(id),
        jointId,
      );

      expect(errors?.calibrationErrorRad).toBeLessThan(errors?.presetErrorRad ?? 0);
      await row(jointId).hover();
      await row(jointId).getByRole('button', { name: 'More' }).click();
      await page.getByRole('menuitem', { name: 'Roll Back' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Roll Back' }).click();
      await expect.poll(() => row(jointId).getAttribute('data-version')).toBe('0');
      await expect.poll(() => trace('calibration').count()).toBe(0);
      expect(await trace('preset').count()).toBe(1);
      expect(app.errors).toEqual([]);
    },
    150000,
  );

  it.skipIf(process.platform === 'win32')(
    'draws the measured robot as a ghost that follows the emulated servos, and labels the largest gap',
    async () => {
      const { page } = app;

      await climbToTest();
      await page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();
      await button(/^Drive$/).click();
      await expect.poll(simDrive, { timeout: 60000 }).toBe('on');
      await page.mouse.click(720, 450);
      await page.keyboard.down('w');

      const moving = await vi.waitFor(
        async () => {
          const g = await ghost();

          expect(g.layer).not.toBeNull();
          expect(Math.abs(g.largest?.degrees ?? 0)).toBeGreaterThan(1);

          return g;
        },
        { timeout: 10000, interval: 100 },
      );

      expect(Object.keys(moving.layer!.parts).sort()).toEqual(['elbow-servo', 'fore', 'upper']);
      expect(moving.layer!.label).toMatch(/^[+-]\d+\.\d°$/);

      for (const [id, degrees] of Object.entries(moving.measured!))
        expect(moving.layer!.values[id] ?? 0).toBeCloseTo(degrees ?? 0, 3);

      expect(spread(moving)).toBeGreaterThan(1);

      await page.keyboard.up('w');
      await expect
        .poll(async () => Math.abs((await ghost()).largest?.degrees ?? Infinity), { timeout: 15000 })
        .toBeLessThan(1.5);

      await openPlayTab(page, 'Operate');
      await button(/^Disconnect$/).click();
      await expect.poll(async () => (await ghost()).layer).toBeNull();
      expect(await page.locator(visible('[data-testid="ghost-gap"]')).count()).toBe(0);
      await page.keyboard.press('Escape');
      expect(app.errors).toEqual([]);
    },
    150000,
  );
});
