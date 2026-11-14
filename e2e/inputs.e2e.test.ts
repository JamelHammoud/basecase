import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saluteMotion, wave } from '../src/cameras/gestures/fixtures/gestures';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { CASE_FORMAT_VERSION } from '../src/cases/schema';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { g1Humanoid } from './g1Fixture';
import { FAKE_CAMERA, openApp, partCount, shown, type App } from './harness';
import { connectPhone, type PhoneSocket } from './phoneClient';

interface SimState {
  drive: string;
  stats: { robots: Array<{ forward: number }> } | null;
}

type Phone = { status: 'off' } | { status: 'pairing'; url: string; token: string; cert: string } | { status: string };

interface StudioWindow {
  __studio: {
    load: (record: unknown) => void;
    simState: () => SimState;
    phone: () => Phone;
    addCase: (raw: unknown) => string;
    feedPose: (samples: PoseSample[]) => void;
    operatorCamera: () => { feeding: boolean };
    inputEvents: () => Array<{ name: string; value: unknown }>;
  };
}

const WATCH_CAMERA = {
  formatVersion: CASE_FORMAT_VERSION,
  id: 'watch-the-camera',
  name: 'Watch the Camera',
  brief: 'Wave back.',
  slot: { needs: [], binding: {} },
  world: { objects: [] },
  controls: [],
  reference: { timeline: [] },
  task: {
    seconds: 30,
    probes: [],
    contract: {
      version: 1,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'elapsed' }, cmp: '>', value: 1, scale: 1 } } },
      },
      failures: [],
    },
  },
};

const TILT_HZ = 30;

let app: App;

const studio = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());

const phoneState = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.phone());

async function load(robot: FixtureRobot) {
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

const feedPose = (samples: PoseSample[]) =>
  app.page.evaluate((s) => (window as unknown as StudioWindow).__studio.feedPose(s), samples);

const fed = () =>
  expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.operatorCamera().feeding), {
      timeout: 60000,
    })
    .toBe(false);

const gestures = async () =>
  (await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.inputEvents()))
    .filter((e) => e.name === 'gesture')
    .map((e) => e.value);

const teachSheet = (phase: string, taught: number) =>
  app.page.locator(`[data-testid="teach-gesture"][data-phase="${phase}"][data-taught="${taught}"]`);

async function command(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.locator(shown('button[data-idx="0"]'), { hasText: label }).waitFor();
  await app.page.keyboard.press('Enter');
}

async function startDriving() {
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await app.page
    .locator(shown('button'), { hasText: /^Drive$/ })
    .first()
    .click();
  await expect.poll(async () => (await studio()).drive, { timeout: 60000 }).toBe('on');
}

async function stopDriving() {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await studio()).drive).toBe('off');
}

beforeAll(async () => {
  app = await openApp({}, ['phone-'], { args: FAKE_CAMERA });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('live inputs', () => {
  it('pairs a phone from ⌘K and drives a rover by its tilt, and refuses the phone after Unpair Phone', async () => {
    await load(fixtureRobots().find((r) => r.id === 'rover-diff')!);
    await command('Pair Phone');
    await expect.poll(() => app.page.getByTestId('phone-qr').count()).toBe(1);

    const pairing = await phoneState();

    if (!('url' in pairing)) throw new Error('Pair Phone should start pairing.');

    const socket: PhoneSocket = await connectPhone(pairing.url, { ca: pairing.cert });

    await expect.poll(async () => (await phoneState()).status).toBe('connected');
    expect(await app.page.getByTestId('phone-qr').count()).toBe(0);
    await startDriving();

    const tilt = setInterval(
      () => socket.send(JSON.stringify({ tilt: [-20, 0], pad: null, buttons: [false, false] })),
      1000 / TILT_HZ,
    );

    try {
      await expect
        .poll(async () => (await studio()).stats?.robots[0].forward ?? 0, { timeout: 30000 })
        .toBeGreaterThan(0.1);
    } finally {
      clearInterval(tilt);
    }

    await stopDriving();
    await command('Unpair Phone');
    await socket.closed;
    await expect.poll(async () => (await phoneState()).status).toBe('off');
    await expect(connectPhone(pairing.url, { ca: pairing.cert })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(app.errors).toEqual([]);
  });
});

describe('gestures', () => {
  it('fires one wave event for a wave, and fires a gesture taught from three examples', async () => {
    const g1 = g1Humanoid();

    await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), g1);
    await expect.poll(() => partCount(app.page), { timeout: 10000 }).toBe(g1.parts.length);
    await app.page.evaluate((raw) => (window as unknown as StudioWindow).__studio.addCase(raw), WATCH_CAMERA);

    await feedPose(wave({ waveS: 3 }));
    await command('Drive with Camera');
    await fed();
    expect(await gestures()).toEqual(['wave']);

    await command('Teach Gesture');
    await app.page.getByRole('textbox', { name: 'Name' }).fill('salute');
    await app.page.keyboard.press('Enter');

    for (let i = 0; i < 3; i++) {
      await teachSheet('recording', i).waitFor({ timeout: 15000 });
      await feedPose(saluteMotion(i));
      await fed();
      await (i < 2 ? teachSheet('countdown', i + 1) : app.page.getByTestId('teach-gesture')).waitFor({
        state: i < 2 ? 'visible' : 'detached',
        timeout: 15000,
      });
    }

    await feedPose(saluteMotion(3));
    await fed();
    expect(await gestures()).toEqual(['wave', 'salute']);
    expect(app.errors).toEqual([]);
  });
});
