import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { checkedCommand, checkedRobotSpec, daemonArgs, emulatedCalibration, LADDER } from './robotSpec.mjs';
import { IntentPacer } from './intentPacer.mjs';

export const DAEMON_ENV = 'BASECASE_ROBOT_DAEMON';
export const DAEMON_FILE = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';

const NEVER_STARTED = 'The robot daemon stopped before it started.';
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

export class RobotLink {
  constructor({ binary, emit, spawnFn = spawnDaemon, tmpDir = os.tmpdir() }) {
    this.binary = binary;
    this.emit = emit;
    this.spawnFn = spawnFn;
    this.tmpDir = tmpDir;
    this.session = null;
  }

  state() {
    const s = this.session;

    return s
      ? { connected: true, spec: s.spec, hello: s.hello, status: s.status, mode: s.mode }
      : { connected: false, spec: null, hello: null, status: null, mode: null };
  }

  connect(ask) {
    const checked = checkedRobotSpec(ask);

    if (!checked.ok) return checked;

    if (this.session) return { ok: false, message: 'An emulated robot is connected. Disconnect it first.' };

    if (!fs.existsSync(this.binary)) return { ok: false, message: 'The robot daemon is missing from this build.' };

    this.start(checked.spec);

    return { ok: true };
  }

  start(spec) {
    const artefacts = fs.mkdtempSync(path.join(this.tmpDir, 'basecase-robot-'));

    fs.writeFileSync(path.join(artefacts, 'calibration.json'), JSON.stringify(emulatedCalibration(spec)));

    const child = this.spawnFn(this.binary, daemonArgs(spec, artefacts));
    const session = { spec, child, artefacts, hello: null, status: null, mode: 'look', asked: false, stderr: '' };

    session.pacer = new IntentPacer({
      ids: spec.ids,
      write: (cmd) => this.write(session, cmd),
      measured: () => session.status,
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
  }

  onLine(session, line) {
    const event = parseLine(line);

    if (!event || this.session !== session) return;

    if (event.event === 'hello') session.hello = event;

    if (event.event === 'status') session.status = event;

    if (typeof event.mode === 'string' && event.event !== 'completed') this.onMode(session, event);

    this.emit(event);
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

    if (!session) return { ok: false, message: 'Connect an emulated robot first.' };

    const command = checkedCommand(ask, session.spec.ids.length);

    if (!command) return { ok: false, message: 'The robot only takes the documented commands.' };

    if (command.cmd === 'intent') session.pacer.hold(command.joints);
    else this.write(session, command);

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
