import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { closeNetworkRobotFixture } from '../../e2e/networkRobotFixture';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-network-lifetime-'));

  directories.push(directory);

  return directory;
}

function daemonProcess() {
  const daemon = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: vi.fn() });

  daemon.kill.mockImplementation(() => {
    queueMicrotask(() => {
      daemon.signalCode = 'SIGTERM';
      daemon.emit('exit', null, 'SIGTERM');
    });
  });

  return daemon;
}

it('cleans partial setup and later attempts without reusing retired resources', async () => {
  const directory = temporaryDirectory();
  const daemon = daemonProcess();
  const failure = new Error('Event delivery failed');
  const forwarding = { close: vi.fn().mockRejectedValue(failure) };
  const app = { close: vi.fn().mockResolvedValue(undefined) };

  await expect(closeNetworkRobotFixture({ forwarding, app })).rejects.toMatchObject({ errors: [failure] });
  await closeNetworkRobotFixture({ directory, daemon });
  await closeNetworkRobotFixture({});
  expect(forwarding.close).toHaveBeenCalledOnce();
  expect(app.close).toHaveBeenCalledOnce();
  expect(daemon.kill).toHaveBeenCalledOnce();
  expect(daemon.signalCode).toBe('SIGTERM');
  expect(fs.existsSync(directory)).toBe(false);
});

it('releases every owned resource and retains all cleanup failures', async () => {
  const directory = temporaryDirectory();
  const daemon = daemonProcess();
  const failures = ['Delivery', 'Fleet', 'Browser'].map((stage) => new Error(`${stage} cleanup failed`));
  const forwarding = { close: vi.fn().mockRejectedValue(failures[0]) };
  const fleet = {
    dispose: vi.fn(() => {
      expect(forwarding.close).toHaveBeenCalledOnce();

      throw failures[1];
    }),
  };
  const app = {
    close: vi.fn(async () => {
      expect(fleet.dispose).toHaveBeenCalledOnce();
      expect(daemon.signalCode).toBe('SIGTERM');

      throw failures[2];
    }),
  };

  await expect(closeNetworkRobotFixture({ directory, daemon, forwarding, fleet, app })).rejects.toMatchObject({
    errors: failures,
  });
  expect(app.close).toHaveBeenCalledOnce();
  expect(fs.existsSync(directory)).toBe(false);
});

it.each([
  { exitCode: 0, signalCode: null },
  { exitCode: null, signalCode: 'SIGTERM' },
])('does not await another exit from an already stopped daemon: %j', async (state) => {
  const daemon = Object.assign(daemonProcess(), state);

  await closeNetworkRobotFixture({ daemon });
  expect(daemon.kill).not.toHaveBeenCalled();
  expect(daemon.listenerCount('exit')).toBe(0);
});
