import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { presetServo } from '../src/reality/servoEstimate';
import { FAMILY_SERVOS } from '../src/reality/servoPart';
import type { ServoCalibration, ServoLog } from '../src/reality/types';
import { ARM } from './armFixture';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, shown, type App } from './harness';

let app: App;

interface Studio {
  attachRobot: (link: unknown) => void;
  load: (record: unknown) => void;
  calibrate: (jointId: string, calibration: ServoCalibration, logs?: ServoLog[]) => void;
  select: (ids: string[]) => void;
  selection: () => string[];
}

type StudioWindow = { __studio: Studio; __fakeRobotLink: unknown };

const servo = FAMILY_SERVOS.sts3215;
const preset = presetServo(servo);
const calibration: ServoCalibration = {
  ...preset,
  servo,
  verdict: 'measured',
  version: 0,
  rung: 'response',
  scales: {},
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 1, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
};
const positions = Array.from({ length: 80 }, (_, i) => Math.sin(i / 10) * 0.1);
const logs: ServoLog[] = [
  {
    servo,
    dt: 0.1,
    goalRad: positions,
    positionRad: positions.map((p) => p * 0.7),
    loadRatio: positions.map(() => 0),
    volts: positions.map(() => 7.4),
    temperatureC: positions.map(() => 30),
    payload: { massKg: 0.06, armM: 0.03 },
  },
];

const row = (id: string) => app.page.locator(shown(`[data-calibration-joint="${id}"]`)).first();
const models = () => app.page.locator(shown('[data-check="Servo models"]')).first();
const rightTab = (name: string) =>
  app.page
    .locator(shown('[role=tab]'))
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first()
    .click();

async function expectMeasured(ids: string[]) {
  const rows = app.page.locator(shown('[data-calibration-joint][data-measured="true"]'));

  expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-calibration-joint')).sort())).toEqual(
    ids,
  );
  await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.select(['upper']));
  await rightTab('Pose');

  const marks = app.page.locator(shown('[data-joint]')).filter({ hasText: 'Measured' });

  await expect
    .poll(() => marks.evaluateAll((els) => els.map((el) => el.getAttribute('data-joint')).sort()))
    .toEqual(ids);
  await rightTab('Build');
  await expect.poll(() => models().getAttribute('data-status')).toBe(ids.length === 2 ? 'pass' : 'warn');
}

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate((record) => {
    const w = window as unknown as StudioWindow;

    w.__studio.attachRobot(w.__fakeRobotLink);
    w.__studio.load(record);
  }, ARM);
  await openPlayTab(app.page, 'Operate');
  await app.page.getByRole('button', { name: 'Connect Emulated Robot', exact: true }).click();
  await app.page.locator(shown('[data-robot-rung="set_up"]')).first().click();
  await vi.waitFor(async () =>
    expect(await app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode')).toBe(
      'set_up',
    ),
  );
  await app.page.locator(shown('[data-robot-rung="test"]')).first().click();
  await vi.waitFor(async () =>
    expect(await app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode')).toBe('test'),
  );
  await app.page.evaluate(
    ({ calibration, logs }) => {
      for (const id of ['shoulder', 'elbow'])
        (window as unknown as StudioWindow).__studio.calibrate(id, calibration, logs);
    },
    { calibration, logs },
  );
  await vi.waitFor(async () => {
    expect(await row('shoulder').getAttribute('data-version')).toBe('1');
    expect(await row('elbow').getAttribute('data-version')).toBe('1');
  });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate calibration history', () => {
  it('replays a measured joint, confirms rollback and offers calibration from Checks', async () => {
    const { page } = app;
    const replay = page.locator(shown('[data-testid="joint-replay"]')).first();
    const trace = (id: string) => replay.locator(`[data-testid="trace-${id}"]`);

    expect(await row('shoulder').getAttribute('data-robot-joint')).toBe('1');
    expect(await row('elbow').getAttribute('data-robot-joint')).toBe('2');
    await expectMeasured(['elbow', 'shoulder']);
    await row('shoulder').locator('button').first().click();

    for (const id of ['logged', 'preset', 'calibration']) await expect.poll(() => trace(id).count()).toBe(1);

    await row('shoulder').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Roll Back' }).click();
    expect(await row('shoulder').getAttribute('data-version')).toBe('1');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await row('shoulder').getAttribute('data-version')).toBe('1');
    await row('shoulder').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Roll Back' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Roll Back', exact: true }).click();
    await expect.poll(() => row('shoulder').getAttribute('data-version')).toBe('0');
    await expect.poll(() => trace('calibration').count()).toBe(0);
    expect(await trace('preset').count()).toBe(1);
    await expectMeasured(['elbow']);
    await models()
      .getByRole('button', { name: /^Servo models/ })
      .click();

    const note = models().locator('li', { hasText: 'Shoulder' }).first();

    await note.hover();
    await note.getByRole('button', { name: 'Fix', exact: true }).click();
    await expect
      .poll(() => page.locator(shown('[data-testid="robot-calibration"]')).first().getAttribute('data-calibrating'))
      .not.toBe('idle');
    expect(await page.evaluate(() => (window as unknown as StudioWindow).__studio.selection())).toContain(
      'shoulder-servo',
    );
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    expect(await row('elbow').getAttribute('data-measured')).toBe('true');
    expect(app.errors).toEqual([]);
  }, 15000);
});
