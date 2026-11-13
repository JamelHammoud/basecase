import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';
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
  };
}

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
  app = await openApp({}, ['phone-']);
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
