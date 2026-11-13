import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BAM_STS3215_7V4 } from '../src/data/servoFits';
import type { CalibrationHistory } from '../src/reality/history';
import type { JointReplayErrors } from '../src/reality/replayClient';
import type { ServoCalibration } from '../src/reality/types';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint, type ScenePart } from '../src/types/robotics';
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

const replay = () => app.page.locator(visible('[data-testid="calibration-replay"]')).first();

type ReplayHooks = {
  __studio: {
    replayErrors: (jointId: string, version?: number) => Promise<JointReplayErrors | null>;
    sceneRecord: () => { project: ProjectSettings };
    calibrate: (jointId: string, calibration: ServoCalibration) => void;
  };
};

const replayErrors = (jointId: string, version?: number) =>
  app.page.evaluate(([id, v]) => (window as unknown as ReplayHooks).__studio.replayErrors(id, v), [
    jointId,
    version,
  ] as const);

async function recordPresetVersion(jointId: string) {
  await app.page.evaluate(
    ([id, fit]) => {
      const { __studio } = window as unknown as ReplayHooks;
      const history = __studio.sceneRecord().project.servoCalibrations?.[id] as CalibrationHistory;

      __studio.calibrate(id, { ...history.versions[0], fit });
    },
    [jointId, BAM_STS3215_7V4] as const,
  );
}

async function checkReplay(jointId: string) {
  await row(jointId).click();
  await expect.poll(() => replay().getAttribute('data-ready'), { timeout: 30000 }).toBe('true');

  for (const trace of ['logged', 'preset', 'calibrated'])
    expect(await replay().locator(`[data-testid="trace-${trace}"]`).getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+L/);

  const errors = await replayErrors(jointId);

  expect(errors?.version).toBe(1);
  expect(errors!.calibratedRad!).toBeLessThan(errors!.presetRad);
}

async function showOlderVersion(jointId: string) {
  await recordPresetVersion(jointId);
  await expect.poll(() => row(jointId).getAttribute('data-version')).toBe('2');
  await expect.poll(() => replay().getAttribute('data-version')).toBe('2');
  await row(jointId).hover();
  await row(jointId).getByRole('button', { name: 'Versions' }).click();
  await app.page.getByRole('menuitem', { name: 'v1' }).click();
  await expect.poll(() => replay().getAttribute('data-version')).toBe('1');

  const [older, newer] = [await replayErrors(jointId, 1), await replayErrors(jointId, 2)];

  expect(older!.calibratedRad!).toBeLessThan(newer!.calibratedRad!);
  expect(newer!.calibratedRad).toBeCloseTo(newer!.presetRad, 9);
}

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
    'calibrates every joint of the emulated arm, replays one before and after, and rolls it back',
    async () => {
      const { page } = app;

      await openPlayTab(page, 'Operate');
      await page.locator(visible('button'), { hasText: 'Connect Emulated Robot' }).first().click();
      await page.locator(visible('[data-robot-rung="set_up"]')).first().click();
      await expect
        .poll(() => page.locator(visible('[data-testid="robot-mode"]')).first().getAttribute('data-mode'))
        .toBe('set_up');
      await page.locator(visible('[data-robot-rung="test"]')).first().click();

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

      const measured = page.locator(visible('[data-calibration-joint][data-verdict="measured"]')).first();
      const jointId = (await measured.getAttribute('data-calibration-joint')) ?? '';

      expect(Number(await row(jointId).getAttribute('data-version'))).toBe(1);
      await checkReplay(jointId);
      await showOlderVersion(jointId);
      await row(jointId).hover();
      await row(jointId).getByRole('button', { name: 'Roll Back' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Roll Back' }).click();
      await expect.poll(() => row(jointId).getAttribute('data-version')).toBe('1');
      expect(app.errors).toEqual([]);
    },
    150000,
  );
});
