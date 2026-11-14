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

let link = null;
let folder = null;

function daemonScript() {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-heartbeat-'));

  const binary = path.join(folder, 'robot-daemon');

  fs.writeFileSync(binary, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(FIXTURE)} "$@"\n`);
  fs.chmodSync(binary, 0o700);

  return binary;
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function busy(ms) {
  const from = Date.now();

  while (Date.now() - from < ms);

  return { from, to: Date.now() };
}

async function waitFor(read, ms = 5000) {
  const deadline = Date.now() + ms;

  while (!read()) {
    if (Date.now() > deadline) throw new Error('Timed out');

    await settle(10);
  }
}

afterEach(async () => {
  link?.disconnect();
  link = null;
  await settle(50);

  if (folder) fs.rmSync(folder, { recursive: true, force: true });

  folder = null;
});

async function runningLink() {
  const events = [];

  link = new RobotLink({ binary: daemonScript(), emit: (e) => events.push(e) });
  expect(link.connect(ARM)).toEqual({ ok: true });
  await waitFor(() => events.some((e) => e.event === 'hello'));
  link.command({ cmd: 'enter', mode: 'test' });
  await waitFor(() => events.some((e) => e.event === 'mode' && e.mode === 'test'));

  return events;
}

const beatsWithin = (events, { from, to }) => events.filter((e) => e.event === 'beat' && e.at > from && e.at < to);
const lostClient = (events) => events.filter((e) => e.event === 'fault' && e.code === 'client_lost');

describe.skipIf(process.platform === 'win32')('robot heartbeat', () => {
  it('keeps beating while the main thread is busy', async () => {
    const events = await runningLink();
    const block = busy(BUSY_MS);

    await waitFor(() => events.some((e) => e.event === 'beat' && e.at >= block.to));

    expect(beatsWithin(events, block).length).toBeGreaterThan(0);
  });

  it('stops feeding the daemon once the main thread stays silent past the host limit', async () => {
    const events = await runningLink();

    busy(SILENT_HOST_MS + BUSY_MS);
    await waitFor(() => lostClient(events).length > 0);

    expect(lostClient(events)).toHaveLength(1);
  }, 15000);
});
