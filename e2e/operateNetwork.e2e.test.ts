import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RobotFleet } from '../electron/robot/robotFleet.mjs';
import type { NetworkRobotAsk } from '../src/robot/networkTypes';
import { ARM } from './armFixture';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';
import { networkRobotEvents } from './networkRobotEvents';

let app: App;
let daemon: ChildProcessWithoutNullStreams;
let fleet: RobotFleet;
let directory: string;
let forwarding: ReturnType<typeof networkRobotEvents>;
const events: Array<Record<string, unknown>> = [];
const daemonEvents: Array<Record<string, unknown>> = [];
const endpoint = { host: '127.0.0.1', port: 0, name: 'Kitchen Arm' };
const binary = path.resolve('hw/dist', process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon');

type Link = { receive: (event: Record<string, unknown>) => void };

type StudioWindow = {
  __studio: { attachRobot: (link: unknown) => void; load: (record: unknown) => void };
  networkLink: Link;
};

const mode = () => app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode');

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-operate-network-'));
  fs.writeFileSync(
    path.join(directory, 'calibration.json'),
    JSON.stringify({
      joints: [1, 2].map((id) => ({
        id,
        name: `joint-${id}`,
        zero_counts: 2048,
        direction: 1,
        min_rad: -1,
        max_rad: 1,
      })),
    }),
  );
  daemon = spawn(binary, [
    '--family',
    'feetech',
    '--ids',
    '1,2',
    '--emulated',
    '--artefacts',
    directory,
    '--listen',
    '127.0.0.1:0',
    '--name',
    endpoint.name,
    '--pairing-code',
    '482619',
  ]);

  let pending = '';

  daemon.stdout.on('data', (chunk) => {
    pending += String(chunk);

    const lines = pending.split('\n');

    pending = lines.pop() ?? '';

    for (const line of lines) daemonEvents.push(JSON.parse(line) as Record<string, unknown>);
  });
  await vi.waitFor(
    () => {
      const listening = daemonEvents.find((event) => event.event === 'listening');

      expect(listening).toBeDefined();
      endpoint.port = Number(String(listening?.address).split(':').at(-1));
    },
    { timeout: 10000 },
  );
  app = await openApp();
  forwarding = networkRobotEvents((event) =>
    app.page.evaluate((next) => (window as unknown as StudioWindow).networkLink?.receive(next), event),
  );
  fleet = new RobotFleet({
    binary,
    tmpDir: directory,
    networkStoreDir: path.join(directory, 'credentials'),
    emit: (event: Record<string, unknown>) => {
      events.push(event);

      forwarding.emit(event);
    },
  });
  await app.page.exposeFunction('networkCall', async (method: string, argument: unknown, unit?: string) => {
    const calls: Record<string, () => unknown> = {
      discover: () => [endpoint],
      connect: () => fleet.connectNetwork(argument as NetworkRobotAsk, unit),
      command: () => fleet.command(argument as Record<string, unknown>, unit),
      disconnect: () => fleet.disconnect(unit),
      state: () => fleet.state(unit),
      units: () => fleet.units(),
      policy: () => ({ ok: true }),
    };

    return calls[method]();
  });
  await app.page.evaluate(() => {
    const target = window as unknown as StudioWindow & {
      networkCall: (method: string, argument?: unknown, unit?: string) => Promise<unknown>;
    };
    const call = target.networkCall;
    const link = {
      receive: (_event: Record<string, unknown>) => {},
      onRobotEvent: (receive: Link['receive']) => {
        link.receive = receive;

        return () => {};
      },
      robotDiscover: () => call('discover'),
      robotNetworkConnect: (ask: unknown, unit?: string) => call('connect', ask, unit),
      robotCommand: (command: unknown, unit?: string) => call('command', command, unit),
      robotDisconnect: (unit?: string) => call('disconnect', null, unit),
      robotState: (unit?: string) => call('state', null, unit),
      robotUnits: () => call('units'),
      robotPolicy: () => call('policy'),
    };

    target.networkLink = link;
    target.__studio.attachRobot(link);
  });
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), ARM);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(ARM.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  try {
    await forwarding?.close();
  } finally {
    fleet?.dispose();

    if (daemon && daemon.exitCode === null) {
      const exited = once(daemon, 'exit');

      daemon.kill();
      await exited;
    }

    await app?.close();

    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Operate a network robot', () => {
  it('pairs once, climbs the daemon ladder to Test and stops on a lost client', async () => {
    await openPlayTab(app.page, 'Operate');
    await expect.poll(() => app.page.locator(shown('[data-testid="network-robot"]')).count()).toBe(1);
    await app.page.getByLabel('Robot', { exact: true }).selectOption(`${endpoint.host}:${endpoint.port}`);
    await app.page.getByLabel('Pairing code').fill('482619');
    await app.page
      .locator(shown('button'), { hasText: /^Connect Robot$/ })
      .first()
      .click();
    await expect.poll(mode).toBe('look');
    await expect.poll(() => events.some((event) => event.event === 'hello')).toBe(true);
    expect(await app.page.locator(shown('[data-testid="operate-panel"]')).first().innerText()).toContain('Kitchen Arm');

    for (const rung of ['set_up', 'test']) {
      await app.page
        .locator(shown(`[data-robot-rung="${rung}"]`))
        .first()
        .click();
      await expect.poll(mode).toBe(rung);
    }

    await expect.poll(() => events.some((event) => event.event === 'status' && event.mode === 'test')).toBe(true);
    fleet.command({ cmd: 'intent', joints: [0.3, 0.2] }, 'robot');
    await expect.poll(() => Number(fleet.state('robot').status?.joints[0]?.position) - 2048).toBeGreaterThan(20);
    fleet.entryOf('robot')!.link.session!.pipe.kill();
    await expect
      .poll(() => daemonEvents.some((event) => event.event === 'fault' && event.code === 'client_lost'))
      .toBe(true);

    const disconnected = daemonEvents.find((event) => event.event === 'client_disconnected')!;
    const fault = daemonEvents.find((event) => event.event === 'fault' && event.code === 'client_lost')!;

    expect(Number(fault.at_us) - Number(disconnected.at_us)).toBeLessThanOrEqual(150000);
    expect(Number(fault.at_us) - Number(disconnected.at_us)).toBeGreaterThanOrEqual(0);
    await expect
      .poll(() =>
        daemonEvents.some((event) => event.event === 'status' && event.run === 'stopped' && event.sealed === true),
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          daemonEvents.filter((event) => event.event === 'status' && Number(event.at_us) > Number(fault.at_us) + 500000)
            .length,
      )
      .toBeGreaterThanOrEqual(2);

    const held = daemonEvents
      .filter((event) => event.event === 'status' && Number(event.at_us) > Number(fault.at_us) + 500000)
      .slice(-2);
    const positions = held.map((event) =>
      (event.joints as Array<{ position: number; torque_on: boolean }>).map((joint) => joint.position),
    );

    expect(positions[0]).toEqual(positions[1]);
    expect((held[1].joints as Array<{ torque_on: boolean }>).every((joint) => joint.torque_on)).toBe(true);
    await expect.poll(() => app.page.locator(shown('[data-testid="network-robot"]')).count()).toBe(1);
    await app.page
      .locator(shown('button'), { hasText: /^Connect Robot$/ })
      .first()
      .click();
    await expect.poll(mode).toBe('look');
    expect(events.filter((event) => event.event === 'hello')).toHaveLength(2);
    expect(app.errors).toEqual([]);
  }, 60000);

  it('sends the scene joint map from the robot computer form', async () => {
    let request: Record<string, unknown> | null = null;

    await openPlayTab(app.page, 'Operate');
    await app.page.route('**/api/bridge/robot-install', async (route) => {
      request = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, message: 'Connect the robot computer to continue.' }),
      });
    });
    await app.page
      .locator(shown('button'), { hasText: /^Add a Robot Computer$/ })
      .first()
      .click();

    const form = app.page.getByRole('dialog', { name: 'Add a Robot Computer' });

    await form.getByLabel('Host').fill('kitchen.local');
    await form.getByLabel('User').fill('robot');
    await form.getByLabel('SSH key').fill('/Users/user/.ssh/robot');
    await form.getByRole('button', { name: 'Install', exact: true }).click();
    await expect
      .poll(() => request, { timeout: 60000 })
      .toMatchObject({
        target: 'robot@kitchen.local',
        key: '/Users/user/.ssh/robot',
        emulated: true,
        spec: { family: 'feetech', ids: [1, 2] },
        jointMap: {
          joints: [
            { id: 1, joint: 'Shoulder', zero_counts: 2048, direction: 1 },
            { id: 2, joint: 'Elbow', zero_counts: 2048, direction: 1 },
          ],
        },
      });
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(app.errors).toEqual([]);
  }, 90000);
});
