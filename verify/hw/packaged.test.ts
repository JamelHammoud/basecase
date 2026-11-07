import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchPackaged, type RunningApp } from '../../e2e/app/packagedApp';
import { lockProblems } from './motorLock.mjs';
import { bundledDaemon, connect, DAEMON_ENV, daemonsUnder, disconnect, EMULATED_ARM, type Proc } from './robotApp';
import { waitFor } from './relayHarness';

const ROBOT_CHANNELS = ['robot:connect', 'robot:command', 'robot:disconnect'];

let run: RunningApp;

const appPid = () => run.app.process().pid ?? -1;

const quietDaemons = () => new Promise((resolve) => setTimeout(resolve, 1500)).then(() => daemonsUnder(appPid()));

interface ChannelReport {
  handles: string[];
  untrusted: Record<string, string>;
  listeners: Record<string, boolean[]>;
}

const probeChannels = (): Promise<ChannelReport> =>
  run.app.evaluate(async ({ ipcMain }, spec) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, (...a: unknown[]) => unknown> })
      ._invokeHandlers;

    if (!(handlers instanceof Map))
      return { handles: ['(this Electron keeps no _invokeHandlers)'], untrusted: {}, listeners: {} };

    const handles = [...handlers.keys()].filter((c) => c.startsWith('robot:'));
    const evil = { senderFrame: { parent: null, url: 'https://example.com/' }, sender: {} };
    const untrusted: Record<string, string> = {};

    for (const channel of handles) {
      try {
        untrusted[channel] = `ANSWERED ${JSON.stringify(await handlers.get(channel)?.(evil, spec))}`;
      } catch (err) {
        untrusted[channel] = String((err as Error)?.message ?? err);
      }
    }

    const onChannels = ipcMain.eventNames().filter((c) => String(c).startsWith('robot:'));
    const listeners = Object.fromEntries(
      onChannels.map((c) => [String(c), ipcMain.listeners(c).map((fn) => String(fn).includes('fromApp('))]),
    );

    return { handles, untrusted, listeners };
  }, EMULATED_ARM);

beforeAll(async () => {
  delete process.env[DAEMON_ENV];
  run = await launchPackaged();
});

afterAll(async () => {
  await run?.close();
});

describe('the packaged app and its robot daemon', () => {
  it('ships the daemon inside the app, locked to emulated servos', () => {
    const daemon = bundledDaemon();

    expect(fs.existsSync(daemon), daemon).toBe(true);
    expect(lockProblems(daemon)).toEqual([]);
  });

  it('spawns the bundled daemon in emulated mode, and stops it on disconnect', async () => {
    expect(await connect(run.page, EMULATED_ARM)).toEqual({ ok: true });

    const [daemon] = await waitFor<Proc[]>('the daemon process', () => {
      const found = daemonsUnder(appPid());

      return found.length ? found : null;
    });

    expect(daemon.args.startsWith(bundledDaemon()) || daemon.args.startsWith(`"${bundledDaemon()}"`)).toBe(true);
    expect(daemon.args).toMatch(/--emulated(\s|$)/);
    expect(daemon.args).toMatch(/--family feetech/);
    expect(daemon.args).toMatch(/--ids 1,2/);
    expect(daemon.args).not.toMatch(/--port/);

    await disconnect(run.page);
    await waitFor('the daemon to exit', () => daemonsUnder(appPid()).length === 0, 5000);
  });

  it('refuses a real port and anything but an emulated robot, without starting a process', async () => {
    const asks = [
      { ...EMULATED_ARM, port: '/dev/cu.usbserial-0001' },
      { ...EMULATED_ARM, emulated: false },
      { family: 'feetech', ids: [1], class: 'arm' },
      { ...EMULATED_ARM, args: ['--port', '/dev/ttyUSB0'] },
      { ...EMULATED_ARM, family: 'feetech --port /dev/ttyUSB0' },
      { ...EMULATED_ARM, ids: [0, 254] },
    ];

    for (const ask of asks) {
      const reply = await connect(run.page, ask);

      expect(reply.ok, JSON.stringify(ask)).toBe(false);
      expect(reply.ok ? '' : reply.message, JSON.stringify(ask)).toMatch(/\w+ \w+/);
      expect(await quietDaemons(), JSON.stringify(ask)).toEqual([]);
    }
  });

  it('registers every robot channel through trustedIpc, and refuses other frames', async () => {
    const report = await probeChannels();

    expect(report.handles).toEqual(expect.arrayContaining(ROBOT_CHANNELS));

    for (const [channel, answer] of Object.entries(report.untrusted)) expect(answer, channel).toMatch(/^Refused/);

    for (const [channel, guarded] of Object.entries(report.listeners)) expect(guarded, channel).not.toContain(false);

    expect(await quietDaemons()).toEqual([]);
  });

  it('ran without page errors', () => {
    expect(run.errors).toEqual([]);
  });
});
