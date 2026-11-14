import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
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
import { IntentPacer } from './intentPacer.mjs';
import { checkedPolicyRefs } from './robotPolicy.mjs';
import { UNITS_FILE, unitsJson } from './servoUnits.mjs';
import { checkedTakeContext, checkedTakeSample } from './takeChecks.mjs';
import { TakeTap } from './takeTap.mjs';

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

function lostMessage(session, error) {
  if (session.hello) return session.hello.lost_message;

  return error ?? (session.stderr.trim().split('\n').at(-1) || NEVER_STARTED);
}

export function daemonBinary({ env = process.env, resources, fromSource, repo }) {
  if (env[DAEMON_ENV]) return env[DAEMON_ENV];

  return fromSource ? path.join(repo, 'hw', 'dist', DAEMON_FILE) : path.join(resources, 'hw', DAEMON_FILE);
}

const spawnDaemon = (binary, args) => spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

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

  if (bytes && written(bytes, target)) return bytes;

  fs.rmSync(target, { force: true });

  return null;
}

const policyHash = (bytes) => (bytes ? createHash('sha256').update(bytes).digest('hex').slice(0, 16) : null);

const NO_TAKES = { open: () => {}, append: () => {}, finish: () => {} };

const CENTERED = { zero_counts: 2048, direction: 1 };

function statusRadians(status, session) {
  const joints = Array.isArray(status?.joints) ? status.joints : [];

  return session.spec.ids.map((id) => {
    const position = joints.find((j) => j?.id === id)?.position;
    const mount = session.calibration.joints.find((j) => j.id === id) ?? CENTERED;

    return typeof position === 'number' ? jointRadians(position, mount) : null;
  });
}

function takeJoints(session, context) {
  const named = context?.joints;

  return named?.length === session.spec.ids.length
    ? named
    : session.spec.ids.map((id, k) => session.calibration.joints[k]?.name ?? `servo ${id}`);
}

export class RobotLink {
  constructor({
    binary,
    emit,
    spawnFn = spawnDaemon,
    tmpDir = os.tmpdir(),
    policyBytes = () => null,
    hornFor = emulatedHorn,
    takes = null,
    now = () => performance.now(),
  }) {
    this.binary = binary;
    this.hornFor = hornFor;
    this.emit = emit;
    this.spawnFn = spawnFn;
    this.tmpDir = tmpDir;
    this.policyBytes = policyBytes;
    this.policyRefs = [];
    this.session = null;
    this.takes = takes;
    this.now = now;
    this.takeContext = null;
    takes?.recover();
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

    const policy = placePolicy(artefacts, this.currentPolicy());

    if (spec.units) fs.writeFileSync(path.join(artefacts, UNITS_FILE), unitsJson(spec.units));

    const child = this.spawnFn(this.binary, daemonArgs(spec, artefacts));
    const session = {
      spec,
      child,
      artefacts,
      calibration,
      hello: null,
      status: null,
      mode: 'look',
      asked: false,
      stderr: '',
    };

    session.tap = this.tapFor(session);
    session.tap.setPolicy(policyHash(policy));
    session.pacer = new IntentPacer({
      ids: spec.ids,
      write: (cmd) => this.writeIntent(session, cmd),
      measured: () => session.status,
      calibration: () => session.calibration.joints,
    });
    this.session = session;
    child.stdin.on('error', () => {});
    readline.createInterface({ input: child.stdout }).on('line', (line) => this.onLine(session, line));
    child.stderr.on('data', (chunk) => {
      session.stderr = `${session.stderr}${chunk}`.slice(-2000);
    });
    child.on('error', (err) => this.onExit(session, err.message));
    child.on('exit', () => this.onExit(session, null));
    this.emit({ event: 'link', state: 'connected', spec });

    if (isServoFamily(spec)) this.emit({ event: 'calibration', joints: calibrationMounts(calibration) });
  }

  tapFor(session) {
    const tap = new TakeTap({
      sink: this.takes?.sink() ?? NO_TAKES,
      emit: (event) => this.emit(event),
      now: this.now,
      joints: () => takeJoints(session, this.takeContext),
      positionsOf: (status) => statusRadians(status, session),
      ids: session.spec.ids,
    });

    if (this.takeContext) tap.setContext(this.takeContext);

    return tap;
  }

  writeIntent(session, command) {
    this.write(session, command);

    if (command.cmd === 'intent') session.tap.intent(command.joints);
  }

  takeScene(ask) {
    const context = checkedTakeContext(ask);

    if (!context) return UNDOCUMENTED;

    this.takeContext = context;
    this.session?.tap.setContext(context);

    return { ok: true };
  }

  takeSample(ask) {
    const sample = checkedTakeSample(ask);

    if (!sample) return UNDOCUMENTED;

    this.session?.tap.sample(sample);

    return { ok: true };
  }

  onLine(session, line) {
    const parsed = parseLine(line);

    if (!parsed || this.session !== session) return;

    const event = this.withTruth(session, parsed);

    if (event.event === 'hello') session.hello = event;

    if (event.event === 'status') session.status = event;

    if (typeof event.mode === 'string' && event.event !== 'completed') this.onMode(session, event);

    session.tap.event(event);
    this.emit(event);
  }

  withTruth(session, event) {
    return event.event === 'status' && isServoFamily(session.spec) ? statusWithLinkAngles(event, this.hornFor) : event;
  }

  onMode(session, event) {
    session.mode = event.mode;

    if (motorsRun(event.mode)) session.pacer.drive();
    else session.pacer.idle();
  }

  write(session, command) {
    if (session.child.stdin.writable) session.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  command(ask) {
    const session = this.session;

    if (!session) return NOT_CONNECTED;

    const command = checkedCommand(ask, session.spec.ids.length);

    if (!command) return UNDOCUMENTED;

    if (command.cmd === 'intent') session.pacer.hold(command.joints);
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

    session.tap.setPolicy(policyHash(placePolicy(session.artefacts, this.currentPolicy())));
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
    session.pacer.stop();
    session.child.stdin.end();
    session.killTimer = setTimeout(() => session.child.kill(), STOP_GRACE_MS);

    return { ok: true };
  }

  onExit(session, error) {
    if (this.session !== session) return;

    this.session = null;
    session.pacer.stop();
    session.tap.close(null);
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
