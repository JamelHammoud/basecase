import { calibrationMounts, checkedCommand, isServoFamily, jointRadians } from './robotCommands.mjs';
import { motionRecordingDeclaration } from './bodyMotionRecording.mjs';
import { RECORDING_STORAGE_FAILURE } from './operateRecorder.mjs';

export const UNDOCUMENTED = { ok: false, message: 'The robot only takes the documented commands.' };

const TELEMETRY_MS = 300;

function sameControl(left, right) {
  return (
    left &&
    typeof left === 'object' &&
    Object.keys(left).length === 2 &&
    left.connection === right.connection &&
    left.revision === right.revision
  );
}

function ready(session, now) {
  const { status, spec } = session;

  return (
    isServoFamily(spec) &&
    !session.endpoint &&
    spec.emulated === true &&
    session.hello?.emulated === true &&
    session.mode === 'test' &&
    status?.run === 'running' &&
    !status.sealed &&
    !status.fault_latched &&
    Number.isFinite(session.heardAt) &&
    now - session.heardAt <= TELEMETRY_MS &&
    spec.ids.every((id) => {
      const joint = status.joints?.find((reading) => reading.id === id);

      return Number.isFinite(joint?.position) && joint.torque_on === true;
    })
  );
}

function matchingBinding(ask, session) {
  if (!ask.recording) return true;

  return (
    JSON.stringify(ask.binding?.spec) === JSON.stringify(session.spec) &&
    JSON.stringify(ask.binding?.calibration) === JSON.stringify(calibrationMounts(session.calibration)) &&
    matchingScene(ask.binding?.scene, session.recorder?.context) &&
    matchingStart(ask.binding?.start, session)
  );
}

function matchingStart(start, session) {
  if (!Array.isArray(start) || start.length !== session.spec.ids.length) return false;

  return session.spec.ids.every((id, index) => {
    const reading = session.status.joints.find((joint) => joint.id === id);
    const mount = session.calibration.joints.find((joint) => joint.id === id);

    return (
      !!mount &&
      Number.isFinite(start[index]) &&
      Math.abs(jointRadians(reading.position, mount) - start[index]) <= (4 * Math.PI) / 4096
    );
  });
}

function matchingScene(left, right) {
  return (
    !!left &&
    !!right &&
    left.sceneId === right.sceneId &&
    left.modelHash === right.modelHash &&
    Array.isArray(left.joints) &&
    left.joints.join('\0') === right.joints.join('\0')
  );
}

export class BenchControl {
  constructor({ session, emit, clock }) {
    this.session = session;
    this.emit = emit;
    this.clock = clock;
    this.connection = crypto.randomUUID();
    this.revision = 0;
    this.held = false;
    this.paused = false;
    this.timer = null;
    this.deadline = 0;
    this.pendingCompletion = null;
  }

  snapshot() {
    return { connection: this.connection, revision: this.revision };
  }

  announce(completion) {
    this.emit({ event: 'control', ...this.snapshot(), held: this.held, ...(completion ? { completion } : {}) });
  }

  validClaim(ask) {
    return (
      Object.keys(ask).every((key) => ['cmd', 'control', 'seconds', 'recording', 'binding'].includes(key)) &&
      (ask.recording === undefined || !!motionRecordingDeclaration(ask.recording)) &&
      sameControl(ask.control, this.snapshot()) &&
      !this.held &&
      !this.paused &&
      !this.pendingCompletion &&
      Number.isFinite(ask.seconds) &&
      ask.seconds > 0 &&
      ask.seconds <= 2 &&
      ready(this.session, this.clock()) &&
      matchingBinding(ask, this.session)
    );
  }

  claim(ask) {
    if (!this.validClaim(ask)) return UNDOCUMENTED;

    this.session.motionCalibration = this.session.calibration;

    if (ask.recording && !this.session.recorder?.beginMotion(ask.recording, this.connection, this.revision + 1))
      return { ok: false, message: RECORDING_STORAGE_FAILURE };

    this.revision++;
    this.held = true;
    this.deadline = this.clock() + ask.seconds * 1000;
    this.timer = setTimeout(
      () => this.revoke(true, ready(this.session, this.clock()) ? 'completed' : 'fault'),
      ask.seconds * 1000,
    );
    this.announce();

    return { ok: true, control: this.snapshot() };
  }

  matches(control) {
    return this.held && this.clock() < this.deadline && sameControl(control, this.snapshot());
  }

  acceptsOwned(command, control) {
    if (control === undefined) return true;

    if (!this.matches(control) || !['intent', 'stop'].includes(command.cmd)) return false;

    if (command.cmd === 'stop' || ready(this.session, this.clock())) return true;

    this.revoke();

    return false;
  }

  command(ask) {
    if (!ask || typeof ask !== 'object' || Array.isArray(ask)) return UNDOCUMENTED;

    if (ask.cmd === 'claim_control') return this.claim(ask);

    const { control, ...bare } = ask;
    const command = checkedCommand(bare, this.session.spec.ids.length);

    if (!command || !this.acceptsOwned(command, control)) return UNDOCUMENTED;

    const competed = control === undefined && this.held;

    if (competed) this.revoke();

    if (competed && command.cmd === 'intent') return UNDOCUMENTED;

    if (command.cmd === 'stop') this.revoke(false);

    if (command.cmd === 'enter') this.paused = false;

    return { command };
  }

  revoke(stop = true, completion = 'cancelled') {
    if (!this.held) return;

    clearTimeout(this.timer);
    this.timer = null;
    this.held = false;
    this.paused = true;
    this.revision++;
    this.pendingCompletion = completion;
    this.session.pipe.idle(true);

    if (stop) this.session.pipe.write({ cmd: 'stop' });

    if (!this.session.pipe.ordered) this.flushCompletion();
  }

  flushCompletion(override) {
    const completion = override ?? this.pendingCompletion;

    if (!this.pendingCompletion) return;

    this.pendingCompletion = null;

    try {
      this.session.recorder?.endMotion(completion);
      this.announce(completion);
    } catch {
      this.session.recorder?.failMotion();
      this.emit({ event: 'control', ...this.snapshot(), held: false, completion: 'storage' });
    }
  }
}
