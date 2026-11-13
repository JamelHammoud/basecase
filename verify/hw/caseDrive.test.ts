import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { repoPath } from '../lib/need';
import { openPlayTab } from '../../e2e/harness';
import { launchDevElectron, type DevApp } from './devElectron';
import { daemonEvents, makeRelay, type Relay, waitFor, type Wire } from './relayHarness';
import { climb, DAEMON_ENV, DAEMON_FILE, mode, openOperate } from './robotApp';
import { bestCorrelation, intentSeries, positionSeries, range } from './series';

const ARM = 'arm-3dof';
const IDLE_MS = 1500;
const DRIVE_MS = 2500;
const MIN_INTENT_HZ = 20;
const MIN_MOVE_RAD = 0.05;
const MAX_IDLE_RAD = 0.02;
const MIN_TELEMETRY_COUNTS = 20;
const MIN_CORRELATION = 0.5;

let dev: DevApp;
let relay: Relay;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const button = (name: string | RegExp) => dev.page.locator(visible('button'), { hasText: name }).first();

const simDrive = () =>
  dev.page.evaluate(
    () => (window as unknown as { __studio: { simState: () => { drive: string } } }).__studio.simState().drive,
  );

async function loadArm() {
  const robot = fixtureRobots().find((r) => r.id === ARM);

  if (!robot) throw new Error(`No ${ARM} fixture`);

  await dev.page.evaluate(
    (record) => (window as unknown as { __studio: { load: (r: unknown) => void } }).__studio.load(record),
    {
      name: ARM,
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    },
  );

  return robot.joints.length;
}

const between = (wires: Wire[], from: number, until: number) => wires.filter((w) => w.t >= from && w.t <= until);

const now = () => relay.entries().at(-1)?.t ?? 0;

beforeAll(async () => {
  relay = makeRelay(repoPath('hw', 'dist', DAEMON_FILE));
  dev = await launchDevElectron({ [DAEMON_ENV]: relay.executable });
}, 240000);

afterAll(async () => {
  await dev?.close();
  relay?.dispose();
});

describe('a Case drives the emulated robot through the daemon', () => {
  it('streams the live sim as intents, and the emulator’s telemetry comes back to the screen', async () => {
    const joints = await loadArm();

    await openOperate(dev.page);
    await button('Connect Emulated Robot').click();
    await waitFor('the daemon to start', () => relay.argv());

    const argv = (relay.argv() ?? []).join(' ');

    expect(argv).toMatch(/--emulated/);
    expect(argv).toMatch(/--class arm/);
    expect(argv).toMatch(new RegExp(`--ids ${Array.from({ length: joints }, (_, i) => i + 1).join(',')}(\\s|$)`));
    await waitFor('Look', async () => (await mode(dev.page).catch(() => null)) === 'look');
    await climb(dev.page, 'set_up');
    await waitFor('Set up', () => daemonEvents(relay, 'mode').some((w) => w.msg.mode === 'set_up'));
    await climb(dev.page, 'test');
    await waitFor('running', () => daemonEvents(relay, 'status').some((w) => w.msg.run === 'running'));

    await openPlayTab(dev.page, 'Cases');
    await button('New Case').click();

    const dots = dev.page.locator(visible('[data-testid="new-case"]')).getByLabel('Dots');

    await dots.fill('3');
    await dots.press('Enter');
    await button('Create').click();
    await button('Try It').click();
    await waitFor('the try to drive', async () => (await simDrive()) === 'on', 60000);

    const idleFrom = now();

    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));

    const idleUntil = now();

    await dev.page.mouse.click(720, 450);
    await dev.page.keyboard.down('w');
    await new Promise((resolve) => setTimeout(resolve, DRIVE_MS));
    await dev.page.keyboard.up('w');

    const driveFrom = idleUntil + 100;
    const driveUntil = now();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const idle = intentSeries(between(relay.sent(), idleFrom, idleUntil), joints);
    const drive = intentSeries(between(relay.sent(), driveFrom, driveUntil), joints);
    const status = positionSeries(between(daemonEvents(relay, 'status'), driveFrom, driveUntil + 1000), joints);
    const moved = drive.map(range);
    const busiest = moved.indexOf(Math.max(...moved));

    expect(drive[0].length).toBeGreaterThanOrEqual(((driveUntil - driveFrom) / 1000) * MIN_INTENT_HZ * 0.9);
    expect(Math.max(...idle.map(range)), 'intents held still before driving').toBeLessThan(MAX_IDLE_RAD);
    expect(Math.max(...moved), 'intents moved while driving').toBeGreaterThanOrEqual(MIN_MOVE_RAD);
    expect(Math.max(...status.map(range)), 'emulated servos moved').toBeGreaterThanOrEqual(MIN_TELEMETRY_COUNTS);
    expect(Math.abs(bestCorrelation(drive[busiest], status[busiest]))).toBeGreaterThanOrEqual(MIN_CORRELATION);

    const recent = daemonEvents(relay, 'status')
      .slice(-30)
      .flatMap((w) => (w.msg.joints as Array<{ id: number; position: number }>).filter((j) => j.id === busiest + 1))
      .map((j) => j.position);
    const shown = Number(
      await dev.page
        .locator(`[data-robot-joint="${busiest + 1}"]:visible`)
        .first()
        .getAttribute('data-position'),
    );

    expect(recent).toContain(shown);
    expect(dev.errors).toEqual([]);
  });
});
