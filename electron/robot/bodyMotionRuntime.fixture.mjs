import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RobotFleet } from './robotFleet.mjs';
import { TryStore, sessionSink } from '../library/tryStore.mjs';
import { jointRadians } from './robotCommands.mjs';
import { checkBodyLoopback } from './bodyMotionLoopback.fixture.mjs';
import { benchOffset } from '../../src/reality/benchSequence.ts';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-body-runtime-'));
const store = new TryStore({ triesDir: path.join(directory, 'tries'), cacheFile: path.join(directory, 'cache.json') });
const events = [];
const listeners = new Set();
const hash = 'a'.repeat(64);
const sourceKey = 'b'.repeat(64);
const fleet = new RobotFleet({
  binary: process.argv[2],
  tries: sessionSink(store),
  tmpDir: directory,
  networkStoreDir: path.join(directory, 'network'),
  publisher: { publish: async () => {}, dispose: () => {} },
  emit: (event) => {
    events.push(event);

    for (const listener of listeners) listener();
  },
});

function observed(predicate) {
  if (predicate()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(new Error('Native runtime observation missing'));
    }, 5000);
    const check = () => {
      if (!predicate()) return;

      clearTimeout(timer);
      listeners.delete(check);
      resolve();
    };

    listeners.add(check);
  });
}

function latest(unit) {
  return events.findLast((event) => event.unit === unit && event.event === 'status');
}

async function connect(unit) {
  assert.equal(fleet.connect({ family: 'feetech', ids: [1, 2], class: 'arm', emulated: true }, unit).ok, true);
  await observed(() => !!latest(unit));
  fleet.record({ scene: { sceneId: 'scene', robot: 'Arm', modelHash: hash, joints: ['a', 'b'] } }, unit);

  await climb(unit);
}

async function climb(unit) {
  fleet.command({ cmd: 'enter', mode: 'set_up' }, unit);
  await observed(() => latest(unit)?.mode === 'set_up');
  fleet.command({ cmd: 'enter', mode: 'test' }, unit);
  await observed(() => latest(unit)?.mode === 'test' && latest(unit)?.run === 'running');
}

function claim(unit) {
  const state = fleet.state(unit);

  return fleet.command(
    {
      cmd: 'claim_control',
      control: state.control,
      seconds: 2,
      recording: { recommendation: hash, sourceKey },
      binding: {
        spec: state.spec,
        calibration: state.calibration,
        scene: fleet.entryOf(unit).link.session.recorder.context,
        start: state.spec.ids.map((id) =>
          jointRadians(
            state.status.joints.find((joint) => joint.id === id).position,
            state.calibration.find((joint) => joint.id === id),
          ),
        ),
      },
    },
    unit,
  );
}

function motion(unit) {
  return events.findLast((event) => event.event === 'recorded' && event.unit === unit && event.manifest?.bodyMotion);
}

try {
  await Promise.all(['arm-a', 'arm-b'].map(connect));

  const startB = latest('arm-b').joints.map((joint) => joint.position);
  const owned = claim('arm-a');
  const link = fleet.entryOf('arm-a').link;
  const delivered = [];
  const recordDelivered = link.recordDelivered.bind(link);

  link.recordDelivered = (session, joints, tag) => {
    if (tag?.connection === owned.control.connection)
      delivered.push(joints.map((value) => Math.round(value * 1e4) / 1e4));

    recordDelivered(session, joints, tag);
  };

  assert.equal(owned.ok, true);
  assert.equal(claim('arm-a').ok, false);
  assert.equal(fleet.command({ cmd: 'intent', joints: [0.1, -0.1], control: owned.control }, 'arm-b').ok, false);

  const started = performance.now();
  const timer = setInterval(() => {
    const seconds = Math.min(2, (performance.now() - started) / 1000);

    fleet.command({ cmd: 'intent', joints: [0.05 * seconds, -0.03 * seconds], control: owned.control }, 'arm-a');
  }, 25);

  try {
    await observed(() => !!motion('arm-a'));
  } finally {
    clearInterval(timer);
  }

  assert.equal(motion('arm-a').manifest.bodyMotion.completion, 'completed');

  const raw = store.session(motion('arm-a').manifest.id).toString();
  const lines = raw.trim().split('\n').map(JSON.parse);

  const distinct = delivered.filter(
    (row, index) => index === 0 || JSON.stringify(row) !== JSON.stringify(delivered[index - 1]),
  );

  assert.ok(distinct.length > 20);
  assert.deepEqual(
    lines.filter((line) => line.k === 'intent').map((line) => line.q),
    distinct,
  );
  assert.ok(lines.filter((line) => line.k === 'status').length >= 10);
  assert.deepEqual(
    latest('arm-b').joints.map((joint) => joint.position),
    startB,
  );
  assert.equal(fleet.command({ cmd: 'intent', joints: [0.2, 0.2], control: owned.control }, 'arm-a').ok, false);

  const selectedManifest = motion('arm-a').manifest;
  const selectedWriteCount = delivered.length;
  const baseline = claim('arm-b');
  const baselineWrites = [];
  const baselineLink = fleet.entryOf('arm-b').link;
  const baselineRecord = baselineLink.recordDelivered.bind(baselineLink);

  baselineLink.recordDelivered = (session, joints, tag) => {
    baselineWrites.push(joints.map((value) => Math.round(value * 1e4) / 1e4));
    baselineRecord(session, joints, tag);
  };
  assert.equal(baseline.ok, true);

  const baselineAt = performance.now();
  const baselineTimer = setInterval(() => {
    const offset = benchOffset(Math.min(2, (performance.now() - baselineAt) / 1000));

    fleet.command({ cmd: 'intent', joints: [offset, offset], control: baseline.control }, 'arm-b');
  }, 25);

  try {
    await observed(() => motion('arm-b')?.manifest.bodyMotion.revision === baseline.control.revision);
  } finally {
    clearInterval(baselineTimer);
  }

  const baselineManifest = motion('arm-b').manifest;
  const baselineRaw = store.session(baselineManifest.id).toString();
  const baselineLines = baselineRaw.trim().split('\n').map(JSON.parse);
  const baselineDistinct = baselineWrites.filter(
    (row, index) => index === 0 || JSON.stringify(row) !== JSON.stringify(baselineWrites[index - 1]),
  );

  assert.equal(baselineManifest.bodyMotion.completion, 'completed');
  assert.deepEqual(
    baselineLines.filter((line) => line.k === 'intent').map((line) => line.q),
    baselineDistinct,
  );
  assert.equal(delivered.length, selectedWriteCount);
  fleet.command({ cmd: 'enter', mode: 'look' }, 'arm-b');
  await observed(() => latest('arm-b')?.mode === 'look');
  await climb('arm-b');

  const cancelled = claim('arm-b');
  const otherLink = fleet.entryOf('arm-b').link;
  const otherDelivered = [];
  const recordOther = otherLink.recordDelivered.bind(otherLink);

  otherLink.recordDelivered = (session, joints, tag) => {
    otherDelivered.push({ at: performance.now(), joints });
    recordOther(session, joints, tag);
  };

  assert.equal(cancelled.ok, true);

  const cancelStart = latest('arm-b').joints.map((joint) => joint.position);
  const cancelGoals = fleet
    .state('arm-b')
    .calibration.map((mount, index) => jointRadians(cancelStart[index], mount) + 0.03);

  assert.equal(fleet.command({ cmd: 'intent', joints: cancelGoals, control: cancelled.control }, 'arm-b').ok, true);
  await observed(() => latest('arm-b').joints.some((joint, index) => joint.position !== cancelStart[index]));

  const stoppedAt = performance.now();

  fleet.command({ cmd: 'stop', control: cancelled.control }, 'arm-b');
  await observed(() => motion('arm-b')?.manifest.bodyMotion.revision === cancelled.control.revision);

  const cancellationMs = performance.now() - stoppedAt;
  const stoppedWrites = otherDelivered.length;

  assert.equal(motion('arm-b').manifest.bodyMotion.completion, 'cancelled');
  assert.equal(fleet.command({ cmd: 'intent', joints: [0.2, 0.2], control: cancelled.control }, 'arm-b').ok, false);

  const loopback = await checkBodyLoopback(process.argv[2], directory);

  assert.equal(otherDelivered.length, stoppedWrites);

  const measurements = {
    platform: process.platform,
    evidence: 'native-servo-daemon-delivery',
    distinctDeliveredCommands: distinct.length,
    recordedCommands: lines.filter((line) => line.k === 'intent').length,
    recordedObservations: lines.filter((line) => line.k === 'status').length,
    recordingBytes: Buffer.byteLength(raw),
    fixedBench: {
      distinctDeliveredCommands: baselineDistinct.length,
      recordedCommands: baselineLines.filter((line) => line.k === 'intent').length,
      recordedObservations: baselineLines.filter((line) => line.k === 'status').length,
      recordingBytes: Buffer.byteLength(baselineRaw),
    },
    cancellationMs,
    commandsAfterStopBoundary: otherDelivered.length - stoppedWrites,
    loopback,
    recordings: [selectedManifest, baselineManifest, motion('arm-b').manifest],
  };

  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync(path.join('scratch', `body-motion-native-${process.platform}.json`), JSON.stringify(measurements));
  process.stdout.write(JSON.stringify(measurements));
} finally {
  fleet.dispose();
  await observed(() => fleet.fleet.size === 0);
  fs.rmSync(directory, { recursive: true, force: true });
}
