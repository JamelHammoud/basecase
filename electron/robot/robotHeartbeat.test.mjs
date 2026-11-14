import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SILENT_HOST_MS } from './intentPacer.mjs';
import { RobotLink } from './robotLink.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const FIXTURE = fileURLToPath(new URL('./heartbeatDaemon.fixture.mjs', import.meta.url));
const BUSY_MS = 500;

const quote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;

function daemonScript() {
  const binary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-heartbeat-')), 'robot-daemon');

  fs.writeFileSync(binary, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(FIXTURE)} "$@"\n`);
  fs.chmodSync(binary, 0o700);

  return binary;
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function busy(ms) {
  const until = performance.now() + ms;

  while (performance.now() < until);
}

async function waitFor(read, ms = 5000) {
  const deadline = Date.now() + ms;

  while (!read()) {
    if (Date.now() > deadline) throw new Error('Timed out');

    await settle(10);
  }
}

let link = null;

afterEach(async () => {
  link?.disconnect();
  link = null;
  await settle(50);
});

async function runningLink() {
  const events = [];

  link = new RobotLink({ binary: daemonScript(), emit: (e) => events.push(e) });
  expect(link.connect(ARM)).toEqual({ ok: true });
  await waitFor(() => events.some((e) => e.event === 'hello'));
  link.command({ cmd: 'enter', mode: 'test' });
  await waitFor(() => events.some((e) => e.event === 'mode' && e.mode === 'test'));
  await settle(200);

  return events;
}

const lostClient = (events) => events.filter((e) => e.event === 'fault' && e.code === 'client_lost');

describe.skipIf(process.platform === 'win32')('robot heartbeat', () => {
  it('keeps the daemon fed while the main thread is busy for longer than its watchdog', async () => {
    const events = await runningLink();

    busy(BUSY_MS);
    await settle(300);

    expect(lostClient(events)).toEqual([]);
  });

  it('stops feeding the daemon once the main thread stays silent past the host limit', async () => {
    const events = await runningLink();

    busy(SILENT_HOST_MS + BUSY_MS);
    await waitFor(() => lostClient(events).length > 0);

    expect(lostClient(events)).toHaveLength(1);
  }, 15000);
});
