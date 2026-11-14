import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { vi } from 'vitest';
import { RobotFleet } from './robotFleet.mjs';
import { RobotLink } from './robotLink.mjs';

function fakeDaemon() {
  const child = new EventEmitter();

  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  child.sent = [];
  child.stdin.on('data', (chunk) =>
    child.sent.push(
      ...String(chunk)
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    ),
  );
  child.say = (event) => child.stdout.write(`${JSON.stringify(event)}\n`);

  return child;
}

function fakeSpawns(options) {
  const binary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-robot-test-')), 'robot-daemon');

  fs.writeFileSync(binary, '');

  const spawned = [];
  const events = [];
  const linkOptions = {
    ...options,
    binary,
    emit: (e) => events.push(e),
    spawnFn: (bin, args) => {
      const child = fakeDaemon();

      spawned.push({ bin, args, child });

      return child;
    },
  };

  return { linkOptions, spawned, events };
}

export function linkWithFake(options = {}) {
  const { linkOptions, spawned, events } = fakeSpawns(options);

  return { link: new RobotLink(linkOptions), spawned, events };
}

export function fleetWithFake(options = {}) {
  const { linkOptions, spawned, events } = fakeSpawns(options);

  return { fleet: new RobotFleet(linkOptions), spawned, events };
}
