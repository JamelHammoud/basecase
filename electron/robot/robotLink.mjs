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
  LADDER,
  mountedCalibration,
} from './robotSpec.mjs';
import { emulatedHorn, statusWithLinkAngles } from './emulatedHorns.mjs';
import { threadPipe, workerPipe } from './daemonPipe.mjs';
import { measuredRadians } from './intentPacer.mjs';
import { checkedPolicyRefs } from './robotPolicy.mjs';
import { UNITS_FILE, unitsJson } from './servoUnits.mjs';

export const DAEMON_ENV = 'BASECASE_ROBOT_DAEMON';
export const DAEMON_FILE = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';

const NEVER_STARTED = 'The robot daemon stopped before it started.';
const NOT_CONNECTED = { ok: false, message: 'Connect an emulated robot first.' };
const UNSAVED = { ok: false, message: "Couldn't save the calibration." };
const CALIBRATION_FILE = 'calibration.json';
const UNDOCUMENTED = { ok: false, message: 'The robot only takes the documented commands.' };
const POLICY_FILE = 'policy.onnx';
const MAX_LINE = 64 * 1024;
const STOP_GRACE_MS = 3000;
const ALIVE_MS = 100;

function lostMessage(session, error) {
  if (session.hello) return session.hello.lost_message;

  return error ?? (session.stderr.trim().split('\n').at(-1) || NEVER_STARTED);
}

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

function written(bytes, target) {
  const staged = `${target}.part`;

  try {
    fs.writeFileSync(staged, bytes);
    fs.renameSync(staged, target);

    return true;
  } catch {
    fs.rmSync(staged, { force: true });

    return false;
  }
}

function placePolicy(artefacts, bytes) {
  const target = path.join(artefacts, POLICY_FILE);

  if (bytes && written(bytes, target)) return;

  fs.rmSync(target, { force: true });
}

export class RobotLink {
  constructor({
    binary,
    emit,
    spawnFn = null,
    tmpDir = os.tmpdir(),
    policyBytes = () => null,
    hornFor = emulatedHorn,
  }) {
    this.binary = binary;
    this.hornFor = hornFor;
    this.emit = emit;
    this.openPipe = spawnFn ? (options) => threadPipe({ ...options, spawnFn }) : workerPipe;
    this.tmpDir = tmpDir;
    this.policyBytes = policyBytes;
    this.policyRefs = [];
    this.session = null;
  }

  state() {
    const s = this.session;

    if (!s) return { connected: false, spec: null, hello: null, status: null, mode: null, calibration: null };

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

  start(spec) {
    const artefacts = fs.mkdtempSync(path.join(this.tmpDir, 'basecase-robot-'));
    const calibration = emulatedCalibration(spec);

    fs.writeFileSync(path.join(artefacts, CALIBRATION_FILE), JSON.stringify(calibration));
    placePolicy(artefacts, this.currentPolicy());

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

    this.session = session;
    session.pipe = this.openPipe({
      binary: this.binary,
      args: daemonArgs(spec, artefacts),
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

    if (command.cmd === 'intent') session.pipe.hold(command.joints);
    else this.write(session, command);

    return { ok: true };
  }

  bytesOf(ref) {
    try {
      return this.policyBytes(ref);
    } catch {
      return null;
    }
  }

  currentPolicy() {
    for (const ref of this.policyRefs) {
      const bytes = this.bytesOf(ref);

      if (bytes) return bytes;
    }

    return null;
  }

  policy(ask) {
    const refs = checkedPolicyRefs(ask);

    if (!refs) return UNDOCUMENTED;

    this.policyRefs = refs;

    const session = this.session;

    if (!session) return { ok: true };

    placePolicy(session.artefacts, this.currentPolicy());
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

    this.session = null;
    clearInterval(session.aliveTimer);
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
