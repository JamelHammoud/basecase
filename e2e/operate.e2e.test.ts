import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ARM, JOINT_NAMES, MIXED_ARM, THREE_JOINT_ARM } from './armFixture';
import { SIM_MODEL_VERSION } from '../src/sim/mjcfTypes';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const ARM_JOINTS = ARM.project.joints.map((joint) => joint.id);

interface FakeLink {
  factory: boolean;
  horns: Record<number, { offsetDeg: number; direction: 1 | -1 }>;
  intents: number[][];
  plantStall: (id: number) => boolean;
  policy: { kind: string; id?: string; hash?: string }[];
  plugIn: () => boolean;
  robotDisconnect: () => Promise<unknown>;
}

interface RecordedCalibrations {
  [jointId: string]: { versions: Array<{ verdict: string; servo?: { componentId: string; variant?: string } }> };
}

type StudioWindow = {
  __studio: {
    load: (r: unknown) => void;
    select: (ids: string[]) => void;
    selection: () => string[];
    calibrations: () => RecordedCalibrations;
    robotCalibration: () => Promise<Array<{ id: number; zero_counts: number; direction: number }> | null>;
  };
  __fakeRobotLink: FakeLink;
};

const TRAINED_ARM = {
  ...ARM,
  name: 'trained arm',
  project: {
    ...ARM.project,
    policies: [
      {
        id: 'policy-e2e-reach',
        name: 'Reach',
        task: 'stand',
        robot: 'arm',
        robotName: 'Arm',
        command: [0, 0, 0],
        trainedSteps: 200000,
        modelVersion: SIM_MODEL_VERSION,
        createdAt: '2026-11-13T12:00:00.000Z',
      },
    ],
  },
};

const row = (id: string) => app.page.locator(visible(`[data-calibration-joint="${id}"]`)).first();

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const rightTab = (name: string) =>
  app.page
    .locator(visible('[role=tab]'), { hasText: new RegExp(`^${name}$`) })
    .first()
    .click();

const servoModels = () => app.page.locator(visible('[data-check="Servo models"]')).first();

const calibrating = () =>
  app.page.locator(visible('[data-testid="robot-calibration"]')).first().getAttribute('data-calibrating');

async function measuredRows() {
  const rows = app.page.locator(visible('[data-calibration-joint][data-measured="true"]'));

  return (await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-calibration-joint') ?? ''))).sort();
}

async function poseMarks() {
  await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.select(['upper']));
  await rightTab('Pose');

  const rows = app.page.locator(visible('[data-joint]'), { hasText: 'Measured' });

  return (await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-joint') ?? ''))).sort();
}

async function expectServoModels(measured: string[]) {
  expect(await poseMarks()).toEqual(measured);
  await rightTab('Build');
  await expect
    .poll(() => servoModels().getAttribute('data-status'), { timeout: 45000 })
    .toBe(measured.length === ARM_JOINTS.length ? 'pass' : 'warn');
}

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
  await loadRecord(ARM);
}, 120000);

async function loadRecord(record: typeof ARM | typeof TRAINED_ARM) {
  await app.page.evaluate(
    (r) => (window as unknown as { __studio: { load: (r: unknown) => void } }).__studio.load(r),
    record,
  );
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(record.parts.length), { timeout: 10000 });
}

afterAll(async () => {
  await app?.close();
});

describe('Operate calibration', () => {
  it('calibrates every joint of the emulated arm, replays one and rolls it back', async () => {
    const { page } = app;

    await climbToTest();

    expect(await page.locator(visible('[data-testid="robot-mode"]')).first().locator('[data-robot-rung]').count()).toBe(
      7,
    );

    const calibrate = page
      .locator(visible('[data-testid="robot-calibration"] button'), { hasText: 'Calibrate Servos' })
      .first();

    await expect.poll(() => calibrate.isEnabled()).toBe(true);
    await calibrate.click();
    await expect
      .poll(() => page.locator(visible('[data-testid="robot-calibration"]')).first().getAttribute('data-calibrating'))
      .not.toBe('idle');
    expect(await button('Calibrating…').isDisabled()).toBe(true);

    for (const id of ['shoulder', 'elbow'])
      await expect
        .poll(() => row(id).getAttribute('data-verdict'), { timeout: 90000 })
        .toMatch(/^(measured|consistent)$/);

    const verdicts = page.locator(visible('[data-calibration-joint][data-verdict="measured"]'));
    const measuredIds = (
      await verdicts.evaluateAll((els) => els.map((el) => el.getAttribute('data-calibration-joint') ?? ''))
    ).sort();

    expect(await measuredRows()).toEqual(measuredIds);
    await expectServoModels(measuredIds);
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
    await row(jointId).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Roll Back' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Roll Back' }).click();
    await expect.poll(() => row(jointId).getAttribute('data-version')).toBe('0');
    await expect.poll(() => trace('calibration').count()).toBe(0);
    expect(await trace('preset').count()).toBe(1);
    expect(await row(jointId).getAttribute('data-measured')).toBe('false');

    const rest = measuredIds.filter((id) => id !== jointId);

    await expectServoModels(rest);
    await servoModels()
      .getByRole('button', { name: /^Servo models/ })
      .click();

    const note = servoModels().locator('li', { hasText: JOINT_NAMES[jointId] }).first();

    await expect.poll(() => note.count(), { timeout: 45000 }).toBe(1);
    await note.hover();
    await note.getByRole('button', { name: 'Fix' }).click();
    await expect.poll(calibrating).not.toBe('idle');
    expect(await page.evaluate(() => (window as unknown as StudioWindow).__studio.selection())).toContain(
      `${jointId}-servo`,
    );
    await expect.poll(calibrating, { timeout: 90000 }).toBe('idle');

    const verdict = await row(jointId).getAttribute('data-verdict');

    expect(await row(jointId).getAttribute('data-measured')).toBe(String(verdict === 'measured'));

    const again = await measuredRows();

    expect(again.filter((id) => id !== jointId)).toEqual(rest);
    await expectServoModels(again);
    expect(app.errors).toEqual([]);
  }, 240000);

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
      expect(moving.layer!.label).toMatch(/^[+−]\d+\.\d°$/);

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

describe('Operate calibration of a mixed arm', () => {
  it('calibrates an STS3215 C046 and an XL430 each against its own servo', async () => {
    const { page } = app;

    await loadRecord(MIXED_ARM);
    await climbToTest();
    await page
      .locator(visible('[data-testid="robot-calibration"] button'), { hasText: 'Calibrate Servos' })
      .first()
      .click();
    await expect.poll(calibrating).not.toBe('idle');
    await expect.poll(calibrating, { timeout: 90000 }).toBe('idle');

    const recorded = await page.evaluate(() => (window as unknown as StudioWindow).__studio.calibrations());
    const newest = (id: string) => recorded[id]?.versions.at(-1);

    expect(newest('shoulder')?.servo).toEqual({ componentId: 'feetech-sts3215', variant: 'c046' });
    expect(newest('elbow')?.servo).toEqual({ componentId: 'dynamixel-xl430-w250' });

    for (const id of ['shoulder', 'elbow']) {
      expect(newest(id)?.verdict).toMatch(/^(measured|consistent|cant-tell)$/);
      expect(await row(id).getAttribute('data-verdict')).toBe(newest(id)?.verdict);
    }

    expect(app.errors).toEqual([]);
  }, 150000);
});

describe('Operate servo setup', () => {
  const walk = [
    { id: 3, name: 'Wrist', link: ['hand'] },
    { id: 2, name: 'Elbow', link: ['fore', 'wrist-servo'] },
    { id: 1, name: 'Shoulder', link: ['upper', 'elbow-servo'] },
  ];

  it.skipIf(process.platform === 'win32')(
    'numbers a bag of factory servos one at a time, lighting each joint, then climbs to Test',
    async () => {
      const { page } = app;
      const selection = () => page.evaluate(() => [...(window as unknown as StudioWindow).__studio.selection()].sort());
      const plugIn = () => page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.plugIn());
      const step = page.locator(visible('[data-testid="servo-setup"] [data-servo-setup-step]')).first();

      await page.evaluate(async () => {
        const link = (window as unknown as StudioWindow).__fakeRobotLink;

        await link.robotDisconnect();
        link.factory = true;
      });
      await loadRecord(THREE_JOINT_ARM);
      await openPlayTab(page, 'Operate');
      await page.locator(visible('button'), { hasText: 'Connect Emulated Robot' }).first().click();
      await expect.poll(() => page.locator(visible('[data-robot-joint]')).count()).toBe(3);
      await page.keyboard.press('Meta+k');
      await page.keyboard.type('Set Up Servos');
      await page.keyboard.press('Enter');

      for (const { id, name, link } of walk) {
        await expect.poll(() => step.getAttribute('data-servo-setup-step'), { timeout: 10000 }).toBe(String(id));
        expect(await step.innerText()).toMatch(new RegExp(`^${name}\\s+${id}$`));
        await expect.poll(selection).toEqual([...link].sort());
        await expect.poll(plugIn, { timeout: 10000 }).toBe(true);
      }

      await expect.poll(() => page.locator(visible('[data-servo-setup-step]')).count(), { timeout: 10000 }).toBe(0);
      await expect.poll(selection).toEqual([]);
      await expect.poll(() => page.locator(visible('[data-robot-joint][data-position=""]')).count()).toBe(0);
      expect(await page.locator(visible('[data-robot-joint]')).count()).toBe(3);
      await page.locator(visible('[data-robot-rung="test"]')).first().click();
      await expect
        .poll(() => page.locator(visible('[data-testid="robot-mode"]')).first().getAttribute('data-mode'))
        .toBe('test');
      expect(app.errors).toEqual([]);
      await page.evaluate(async () => {
        const link = (window as unknown as StudioWindow).__fakeRobotLink;

        link.factory = false;
        await link.robotDisconnect();
      });
    },
    60000,
  );
});

describe('Operate zero and direction', () => {
  const written = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.robotCalibration());
  const horns = { 1: { offsetDeg: 12, direction: 1 }, 2: { offsetDeg: 0, direction: -1 } } as const;

  it('finds a reversed elbow and a 12° shoulder horn from the camera in Calibrate Servos', async () => {
    const { page } = app;

    await loadRecord(ARM);
    await climbToTest();
    await page.evaluate((h) => Object.assign((window as unknown as StudioWindow).__fakeRobotLink.horns, h), horns);
    await expect.poll(() => button('Calibrate Servos').isEnabled()).toBe(true);
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByLabel('Search commands').fill('Calibrate Servos');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await written())?.[1].direction, { timeout: 90000 }).toBe(-1);

    const [shoulder] = (await written())!;

    expect([shoulder.direction, Math.abs(((shoulder.zero_counts - 2048) * 360) / 4096 - 12) < 2]).toEqual([1, true]);
    await expect.poll(calibrating, { timeout: 90000 }).toBe('idle');
    expect(app.errors).toEqual([]);
    await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.robotDisconnect());
  }, 150000);
});

describe('Operate policy', () => {
  const mode = () => app.page.locator(visible('[data-testid="robot-mode"]')).first().getAttribute('data-mode');
  const sentPolicy = () => app.page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.policy);
  const needsPolicy = () => app.page.getByText('Load a policy first.').count();

  it('sends the scene’s trained policy to the robot, so the Ladder climbs to Rehearse', async () => {
    await loadRecord(TRAINED_ARM);
    await expect.poll(sentPolicy).toEqual([{ kind: 'policy', id: 'policy-e2e-reach' }]);
    await climbToTest();
    await app.page.locator(visible('[data-robot-rung="rehearse"]')).first().click();
    await expect.poll(mode).toBe('rehearse');
    expect(await needsPolicy()).toBe(0);
    expect(app.errors).toEqual([]);
  }, 60000);

  it('keeps Rehearse refused for a scene with no trained policy', async () => {
    await loadRecord(ARM);
    await expect.poll(sentPolicy).toEqual([]);
    await climbToTest();
    await app.page.locator(visible('[data-robot-rung="rehearse"]')).first().click();
    await expect.poll(needsPolicy).toBeGreaterThan(0);
    expect(await mode()).toBe('test');
    await app.page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.robotDisconnect());
  }, 60000);
});

describe('Operate replay', () => {
  interface Replayed {
    activeCase: string | null;
    tries: unknown[];
    joints: Record<string, { target: number; position: number }>;
  }

  const link = () => app.page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.intents.length);
  const replayed = () =>
    app.page.evaluate(() => (window as unknown as { __studio: { simState: () => Replayed } }).__studio.simState());

  it.skipIf(process.platform === 'win32')(
    'replays a run whose elbow stalled as a Case in the sim, with the elbow selected',
    async () => {
      const { page } = app;

      await loadRecord(ARM);
      await climbToTest();
      await page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();
      await button(/^Drive$/).click();
      await expect.poll(simDrive, { timeout: 60000 }).toBe('on');
      await page.mouse.click(720, 450);
      await page.keyboard.down('w');
      await expect.poll(link, { timeout: 20000 }).toBeGreaterThan(20);
      await page.keyboard.up('w');

      const moved = await link();

      await expect.poll(link, { timeout: 20000 }).toBeGreaterThan(moved + 10);
      expect(await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.plantStall(2))).toBe(true);

      const sent = await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.intents.at(-1)!);

      await openPlayTab(page, 'Operate');
      await page.locator(visible('[data-robot-message="fault"] button'), { hasText: 'Replay in Sim' }).first().click();
      await expect.poll(async () => (await replayed()).activeCase).toMatch(/^fault-at-/);
      expect(await page.evaluate(() => (window as unknown as StudioWindow).__studio.selection())).toEqual(['fore']);

      const gap = async () => {
        const { joints } = await replayed();

        return Math.max(...ARM_JOINTS.map((id, k) => Math.abs(((joints[id]?.target ?? 0) * Math.PI) / 180 - sent[k])));
      };

      await expect.poll(gap, { timeout: 60000, interval: 100 }).toBeLessThan(0.02);
      await expect.poll(async () => (await replayed()).tries.length, { timeout: 60000 }).toBe(1);
      expect(await page.locator(visible('[data-testid="peak-row"]')).count()).toBeGreaterThan(0);
      expect(app.errors).toEqual([]);
      await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.robotDisconnect());
    },
    150000,
  );
});
