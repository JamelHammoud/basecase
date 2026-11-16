import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calibrationMounts,
  checkedCommand,
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
import { OperateRecorder } from './operateRecorder.mjs';
import { readRecordedRun } from './recordedRun.mjs';
import { checkedPolicyRefs } from './robotPolicy.mjs';
import { UNITS_FILE, unitsJson } from './servoUnits.mjs';

export const DAEMON_ENV = 'BASECASE_ROBOT_DAEMON';
export const DAEMON_FILE = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';
export const NOT_CONNECTED = { ok: false, message: 'Connect an emulated robot first.' };
export const UNDOCUMENTED = { ok: false, message: 'The robot only takes the documented commands.' };

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
  const mounts = isServoFamily(session.spec) ? session.calibration.joints : [];

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

    return { connected: true, spec: s.spec, hello: s.hello, status: s.status, mode: s.mode, calibration };
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

  recorderFor(session, policy) {
    if (!this.tries) return null;

    const recorder = new OperateRecorder({
      spec: session.spec,
      sink: this.tries,
      radians: (status) => statusRadians(status, session),
      clock: this.clock,
      onClosed: ({ joints, ...closed }) => {
        this.lastRecording = closed.manifest && joints ? { id: closed.id, joints } : null;
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
      binary: this.binary,
      args: daemonArgs(spec, artefacts, this.seed),
      on: {
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

    if (event.event === 'status') session.status = event;

    if (typeof event.mode === 'string' && event.event !== 'completed') this.onMode(session, event);

    session.recorder?.event(event);
    this.emit(event);
  }

  withTruth(session, event) {
    return event.event === 'status' && isServoFamily(session.spec) ? statusWithLinkAngles(event, this.hornFor) : event;
  }

  onMode(session, event) {
    session.mode = event.mode;

    if (motorsRun(event.mode))
      session.pipe.drive(measuredRadians(session.status, session.spec.ids, session.calibration.joints));
    else session.pipe.idle();
  }

  write(session, command) {
    session.pipe.write(command);
  }

  command(ask) {
    const session = this.session;

    if (!session) return NOT_CONNECTED;

    const command = checkedCommand(ask, session.spec.ids.length);

    if (!command) return UNDOCUMENTED;

    if (command.cmd === 'intent') this.intend(session, command.joints);
    else this.write(session, command);

    return { ok: true };
  }

  intend(session, joints) {
    session.pipe.hold(joints);

    if (motorsRun(session.mode) && session.status?.run === 'running') session.recorder?.intent(joints);
  }

  readRun() {
    return this.session?.recorder?.readRun() ?? readRecordedRun(this.tries, this.lastRecording);
  }

  record(ask) {
    const recorder = this.session?.recorder;

    if (!recorder) return this.session ? { ok: true } : NOT_CONNECTED;

    const scene = ask && typeof ask === 'object' && Object.keys(ask).join() === 'scene';
    const taken = scene ? recorder.setContext(ask.scene) : recorder.sample(ask);

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

    session.recorder?.setPolicy(hashOf(policy));
    this.write(session, { cmd: 'recheck' });

    return { ok: true };
  }

  calibrate(ask) {
    const session = this.session;

    if (!session) return NOT_CONNECTED;

    const mounts = isServoFamily(session.spec) ? checkedMounts(ask, session.spec) : null;

    if (!mounts) return UNDOCUMENTED;

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

    session.asked = true;
    clearInterval(session.aliveTimer);
    session.pipe.end();
    session.killTimer = setTimeout(() => session.pipe.kill(), STOP_GRACE_MS);

    return { ok: true };
  }

  onExit(session, error) {
    if (this.session !== session) return;

    clearInterval(session.aliveTimer);
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
