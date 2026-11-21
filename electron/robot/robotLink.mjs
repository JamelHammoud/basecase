import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calibrationMounts,
  checkedMounts,
  checkedRobotSpec,
  daemonArgs,
  emulatedCalibration,
  isServoFamily,
  jointRadians,
  LADDER,
  mountedCalibration,
} from './robotSpec.mjs';
import { emulatedHorn, statusWithLinkAngles } from './emulatedHorns.mjs';
import { threadPipe, workerPipe } from './daemonPipe.mjs';
import { measuredRadians } from './intentPacer.mjs';
import { OperateRecorder, RECORDING_STORAGE_FAILURE } from './operateRecorder.mjs';
import { readRecordedRun } from './recordedRun.mjs';
import { checkedPolicyRefs } from './robotPolicy.mjs';
import { UNITS_FILE, unitsJson } from './servoUnits.mjs';
import { BenchControl, UNDOCUMENTED } from './benchControl.mjs';

export { UNDOCUMENTED } from './benchControl.mjs';

export const DAEMON_ENV = 'BASECASE_ROBOT_DAEMON';
export const DAEMON_FILE = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';
export const NOT_CONNECTED = { ok: false, message: 'Connect an emulated robot first.' };

const NEVER_STARTED = 'The robot daemon stopped before it started.';
const UNSAVED = { ok: false, message: "Couldn't save the calibration." };
const CALIBRATION_FILE = 'calibration.json';
const POLICY_FILE = 'policy.onnx';
const UNAVAILABLE_POLICY = { ok: false, message: 'Choose a skill with a saved policy.' };
const UNSAVED_POLICY = { ok: false, message: 'Couldn’t save the policy.' };
const MAX_LINE = 64 * 1024;
const STOP_GRACE_MS = 3000;
const ALIVE_MS = 100;

function lostMessage(session, error) {
  if (session.hello) return session.hello.lost_message;

  return error ?? (session.stderr.trim().split('\n').at(-1) || NEVER_STARTED);
}

export const disconnectedState = () => ({
  connected: false,
  spec: null,
  hello: null,
  status: null,
  mode: null,
  calibration: null,
});

export function daemonBinary({ env = process.env, resources, fromSource, repo }) {
  if (env[DAEMON_ENV]) return env[DAEMON_ENV];

  return fromSource ? path.join(repo, 'hw', 'dist', DAEMON_FILE) : path.join(resources, 'hw', DAEMON_FILE);
}

const parseLine = (line) => {
  if (line.length > MAX_LINE) return null;

  try {
    const value = JSON.parse(line);

    return value && typeof value === 'object' && typeof value.event === 'string' ? value : null;
  } catch {
    return null;
  }
};

const motorsRun = (mode) => LADDER.indexOf(mode) >= LADDER.indexOf('test');

const CENTERED = { zero_counts: 2048, direction: 1 };

function statusRadians(status, session) {
  const joints = Array.isArray(status.joints) ? status.joints : [];
  const calibration = session.recorder?.session?.bodyMotion ? session.motionCalibration : session.calibration;
  const mounts = isServoFamily(session.spec) ? calibration.joints : [];

  return session.spec.ids.map((id) => {
    const position = joints.find((j) => j?.id === id)?.position;
    const mount = mounts.find((m) => m.id === id) ?? CENTERED;

    return typeof position === 'number' ? jointRadians(position, mount) : null;
  });
}

const hashOf = (bytes) => (bytes ? createHash('sha256').update(bytes).digest('hex') : null);

function removeFile(target) {
  try {
    fs.rmSync(target, { force: true });

    return true;
  } catch {
    return false;
  }
}

function written(bytes, target) {
  const staged = `${target}.part`;

  try {
    fs.writeFileSync(staged, bytes);
    fs.renameSync(staged, target);

    return true;
  } catch {
    removeFile(staged);

    return false;
  }
}

function placePolicy(artefacts, bytes) {
  const target = path.join(artefacts, POLICY_FILE);

  return bytes ? written(bytes, target) : removeFile(target);
}

export class RobotLink {
  constructor({
    binary,
    emit,
    spawnFn = null,
    tmpDir = os.tmpdir(),
    policyBytes = () => null,
    hornFor = emulatedHorn,
    tries = null,
    clock = () => Date.now(),
    seed = null,
  }) {
    this.seed = seed;
    this.tries = tries;
    this.clock = clock;
    this.binary = binary;
    this.hornFor = hornFor;
    this.emit = emit;
    this.openPipe = spawnFn ? (options) => threadPipe({ ...options, spawnFn }) : workerPipe;
    this.tmpDir = tmpDir;
    this.policyBytes = policyBytes;
    this.policyRefs = [];
    this.activePolicy = null;
    this.session = null;
    this.lastRecording = null;
  }

  state() {
    const s = this.session;

    if (!s) return disconnectedState();

    const calibration = isServoFamily(s.spec) ? calibrationMounts(s.calibration) : null;

    return {
      connected: true,
      spec: s.spec,
      hello: s.hello,
      status: s.status,
      mode: s.mode,
      calibration,
      control: this.controlFor(s).snapshot(),
    };
  }

  connect(ask) {
    const checked = checkedRobotSpec(ask);

    if (!checked.ok) return checked;

    if (this.session) return { ok: false, message: 'An emulated robot is connected. Disconnect it first.' };

    if (!fs.existsSync(this.binary))
      return {
        ok: false,
        message: 'This copy of Basecase can’t run robots. Download Basecase again from basecase.so.',
      };

    this.start(checked.spec);

    return { ok: true };
  }

  controlFor(session) {
    session.control ??= new BenchControl({ session, emit: this.emit, clock: this.clock });

    return session.control;
  }

  recorderFor(session, policy) {
    if (!this.tries) return null;

    const recorder = new OperateRecorder({
      spec: session.spec,
      sink: this.tries,
      radians: (status) => statusRadians(status, session),
      clock: this.clock,
      onClosed: ({ joints, ...closed }) => {
        this.lastRecording =
          closed.manifest && joints ? { id: closed.id, joints, bodyMotion: closed.manifest.bodyMotion } : null;
        this.emit({ event: 'recorded', ...closed });
      },
    });

    recorder.setPolicy(hashOf(policy));

    return recorder;
  }

  start(spec) {
    const artefacts = fs.mkdtempSync(path.join(this.tmpDir, 'basecase-robot-'));
    const calibration = emulatedCalibration(spec);
    const { ref, bytes: policy } = this.currentPolicy();

    fs.writeFileSync(path.join(artefacts, CALIBRATION_FILE), JSON.stringify(calibration));
    this.activePolicy = placePolicy(artefacts, policy) ? ref : null;

    if (spec.units) fs.writeFileSync(path.join(artefacts, UNITS_FILE), unitsJson(spec.units));

    const session = {
      spec,
      artefacts,
      calibration,
      hello: null,
      status: null,
      mode: 'look',
      asked: false,
      stderr: '',
    };

    session.recorder = this.recorderFor(session, policy);
    this.session = session;
    session.pipe = this.openPipe({
      clock: this.clock,
      binary: this.binary,
      args: daemonArgs(spec, artefacts, this.seed),
      on: {
        intent: (joints, tag) => this.recordDelivered(session, joints, tag),
        idle: () => {
          if (this.session === session) this.controlFor(session).flushCompletion();
        },
        line: (line) => this.onLine(session, line),
        stderr: (chunk) => {
          session.stderr = `${session.stderr}${chunk}`.slice(-2000);
        },
        exit: (error) => this.onExit(session, error),
      },
    });
    session.aliveTimer = setInterval(() => session.pipe.alive(), ALIVE_MS);
    this.emit({ event: 'link', state: 'connected', spec });

    if (isServoFamily(spec)) this.emit({ event: 'calibration', joints: calibrationMounts(calibration) });
  }

  onLine(session, line) {
    const parsed = parseLine(line);

    if (!parsed || this.session !== session) return;

    const event = this.withTruth(session, parsed);

    if (event.event === 'hello') session.hello = event;

    if (event.event === 'status') {
      session.status = event;
      session.heardAt = this.clock();
    }

    if (event.event === 'stopped') this.controlFor(session).revoke(false, 'fault');

    if (typeof event.mode === 'string' && event.event !== 'completed') this.onMode(session, event);

    if (event.event === 'fault') {
      this.emit(event);
      this.recordSafely(session, () => session.recorder?.event(event));
      this.controlFor(session).revoke(false, 'fault');

      return;
    }

    this.recordSafely(session, () => session.recorder?.event(event));
    this.emit(event);
  }

  withTruth(session, event) {
    return event.event === 'status' && isServoFamily(session.spec) ? statusWithLinkAngles(event, this.hornFor) : event;
  }

  onMode(session, event) {
    session.mode = event.mode;

    if (event.mode !== 'test') this.controlFor(session).revoke(true, 'stale');

    if (motorsRun(event.mode) && !this.controlFor(session).paused)
      session.pipe.drive(measuredRadians(session.status, session.spec.ids, session.calibration.joints));
    else session.pipe.idle();
  }

  write(session, command) {
    session.pipe.write(command);
  }

  command(ask) {
    const session = this.session;

    if (!session) return NOT_CONNECTED;

    const checked = this.controlFor(session).command(ask);

    if (!checked.command) return checked;

    const { command } = checked;

    if (command.cmd === 'intent') this.intend(session, command.joints);
    else this.write(session, command);

    return { ok: true };
  }

  intend(session, joints) {
    const control = this.controlFor(session);

    session.pipe.hold(control.held ? { joints, tag: control.snapshot() } : joints);

    if (motorsRun(session.mode) && session.status?.run === 'running' && !session.recorder?.session?.bodyMotion)
      session.recorder?.intent(joints);
  }

  recordDelivered(session, joints, tag) {
    const motion = session.recorder?.session?.bodyMotion;

    if (
      this.session !== session ||
      !motion ||
      tag?.connection !== motion.connection ||
      tag?.revision !== motion.revision
    )
      return;

    this.recordSafely(session, () => session.recorder.intent(joints, tag.at));
  }

  recordSafely(session, write) {
    try {
      write();

      return true;
    } catch {
      this.controlFor(session).revoke(true, 'storage');
      session.recorder?.failMotion();

      return false;
    }
  }

  readRun() {
    return this.session?.recorder?.readRun() ?? readRecordedRun(this.tries, this.lastRecording);
  }

  record(ask) {
    const recorder = this.session?.recorder;

    if (!recorder) return this.session ? { ok: true } : NOT_CONNECTED;

    const scene = ask && typeof ask === 'object' && Object.keys(ask).join() === 'scene';
    let taken = false;
    const written = this.recordSafely(this.session, () => {
      taken = scene ? recorder.setContext(ask.scene) : recorder.sample(ask);
    });

    if (!written) return { ok: false, message: RECORDING_STORAGE_FAILURE };

    if (taken && scene && recorder.motionContextChanged()) this.controlFor(this.session).revoke(true, 'stale');

    return taken ? { ok: true } : UNDOCUMENTED;
  }

  bytesOf(ref) {
    try {
      return this.policyBytes(ref);
    } catch {
      return null;
    }
  }

  currentPolicy(refs = this.policyRefs) {
    for (const ref of refs) {
      const bytes = this.bytesOf(ref);

      if (bytes) return { ref, bytes };
    }

    return { ref: null, bytes: null };
  }

  policy(ask, requirePolicy = false) {
    const refs = checkedPolicyRefs(ask);

    if (!refs) return UNDOCUMENTED;

    const session = this.session;
    const { ref, bytes: policy } = this.currentPolicy(refs);

    if (requirePolicy && !policy) return UNAVAILABLE_POLICY;

    if (session && !placePolicy(session.artefacts, policy)) return UNSAVED_POLICY;

    this.policyRefs = refs;
    this.activePolicy = ref;

    if (!session) return { ok: true };

    this.controlFor(session).revoke(true, 'stale');
    session.recorder?.setPolicy(hashOf(policy));
    this.write(session, { cmd: 'recheck' });

    return { ok: true };
  }

  calibrate(ask) {
    const session = this.session;

    if (!session) return NOT_CONNECTED;

    const mounts = isServoFamily(session.spec) ? checkedMounts(ask, session.spec) : null;

    if (!mounts) return UNDOCUMENTED;

    this.controlFor(session).revoke(true, 'stale');

    const calibration = mountedCalibration(session.calibration, mounts);

    if (!written(JSON.stringify(calibration), path.join(session.artefacts, CALIBRATION_FILE))) return UNSAVED;

    session.calibration = calibration;
    this.emit({ event: 'calibration', joints: calibrationMounts(calibration) });
    this.write(session, { cmd: 'recheck' });

    return { ok: true };
  }

  disconnect() {
    const session = this.session;

    if (!session) return { ok: true };

    this.controlFor(session).revoke(true, 'disconnect');
    session.asked = true;
    clearInterval(session.aliveTimer);
    session.pipe.end();
    session.killTimer = setTimeout(() => session.pipe.kill(), STOP_GRACE_MS);

    return { ok: true };
  }

  onExit(session, error) {
    if (this.session !== session) return;

    clearInterval(session.aliveTimer);
    this.controlFor(session).revoke(false, 'disconnect');
    this.controlFor(session).flushCompletion('disconnect');
    session.recorder?.close('disconnect');
    this.session = null;
    clearTimeout(session.killTimer);
    fs.rmSync(session.artefacts, { recursive: true, force: true });

    if (session.asked) {
      this.emit({ event: 'link', state: 'closed' });

      return;
    }

    this.emit({ event: 'link', state: 'lost', message: lostMessage(session, error) });
  }

  dispose() {
    this.disconnect();
  }
}
