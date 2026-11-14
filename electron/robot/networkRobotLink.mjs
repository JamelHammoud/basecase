import fs from 'node:fs';
import path from 'node:path';
import { RobotLink, UNDOCUMENTED } from './robotLink.mjs';
import { calibrationMounts, checkedMounts, checkedRobotSpec, isServoFamily } from './robotSpec.mjs';
import { checkedEndpoint, resolveRobotHost } from './networkAddress.mjs';
import { checkedPolicyRefs } from './robotPolicy.mjs';
import { pairNetworkRobot } from './networkPairClient.mjs';
import { matchesRobotId } from './networkIdentity.mjs';
import { networkPipe } from './networkPipe.mjs';

const CONNECTED = { ok: false, message: 'A robot is connected. Disconnect it first.' };
const BAD_ENDPOINT = { ok: false, message: 'Enter the robot’s local address and six-digit pairing code.' };
const FILES = ['calibration.json', 'policy.onnx'];

const jointRange = (joint) =>
  Number.isFinite(joint?.min_rad) && Number.isFinite(joint?.max_rad) && joint.min_rad < joint.max_rad;

function checkedCalibration(calibration, spec) {
  const joints = calibration?.joints;
  const calibrated =
    Array.isArray(joints) &&
    joints.length === spec.ids.length &&
    spec.ids.every((id) => joints.filter((joint) => joint?.id === id).length === 1);
  const mounts = calibrated ? joints.map(({ id, zero_counts, direction }) => ({ id, zero_counts, direction })) : null;
  const valid =
    calibrated &&
    (calibration.class ?? 'arm') === spec.class &&
    joints.every(jointRange) &&
    checkedMounts(mounts, spec);

  return valid ? { ...calibration, class: calibration.class ?? 'arm' } : { joints: [], class: spec.class };
}

function checkedGreeting(hello, key, expectedId) {
  if (!matchesRobotId(hello.id, key, expectedId)) throw new Error('Check the robot’s address and pairing code.');

  const checked = checkedRobotSpec(hello.spec);

  if (!checked.ok || hello.family !== checked.spec.family || hello.emulated !== true || hello.real_transport !== false)
    throw new Error('This build can connect only to an emulated robot.');

  return { spec: checked.spec, calibration: checkedCalibration(hello.calibration, checked.spec) };
}

export class NetworkRobotLink extends RobotLink {
  constructor(options) {
    super(options);
    this.credentials = options.credentials;
    this.pairRobot = options.pairRobot ?? pairNetworkRobot;
    this.resolveHost = options.resolveHost ?? resolveRobotHost;
    this.connecting = false;
    this.generation = 0;
    this.policyTouched = false;
  }

  state() {
    const state = super.state();

    return this.session ? { ...state, endpoint: this.session.endpoint } : state;
  }

  async connect(ask) {
    const endpoint = checkedEndpoint(ask);

    if (!endpoint) return BAD_ENDPOINT;

    if (this.session || this.connecting) return CONNECTED;

    this.connecting = true;

    try {
      return await this.openNetwork(endpoint);
    } catch (error) {
      return { ok: false, message: error.message };
    } finally {
      this.connecting = false;
    }
  }

  async openNetwork(endpoint) {
    const generation = this.generation;
    const address = await this.resolveHost(endpoint.host);

    if (generation !== this.generation) return { ok: false, message: 'The robot connection was canceled.' };

    if (endpoint.code) await this.pair(endpoint, address);

    if (generation !== this.generation) return { ok: false, message: 'The robot connection was canceled.' };

    const key = this.credentials.read(endpoint, address);
    const { pipe, ready } = networkPipe({
      endpoint,
      address,
      key,
      saveKey: (saved) => this.credentials.save(endpoint, saved, address),
      on: {
        line: (line) => this.session?.pipe === pipe && this.onLine(this.session, line),
        exit: (error) => this.session?.pipe === pipe && this.onExit(this.session, error),
      },
    });

    this.pending = pipe;

    const hello = await ready;

    this.pending = null;

    if (generation !== this.generation) {
      pipe.kill();

      return { ok: false, message: 'The robot connection was canceled.' };
    }

    let checked;

    try {
      checked = checkedGreeting(hello, key, endpoint.id);
      this.credentials.save(endpoint, key, address);
    } catch (error) {
      pipe.kill();

      throw error;
    }

    const artefacts = fs.mkdtempSync(path.join(this.tmpDir, 'basecase-network-robot-'));

    fs.writeFileSync(path.join(artefacts, 'calibration.json'), JSON.stringify(checked.calibration));

    const session = {
      ...checked,
      endpoint: { host: endpoint.host, port: endpoint.port },
      artefacts,
      pipe,
      hello: null,
      status: null,
      mode: 'look',
      asked: false,
      stderr: '',
    };

    session.recorder = this.recorderFor(session, null);
    this.session = session;
    session.aliveTimer = setInterval(() => pipe.alive(), 100);
    this.emit({ event: 'link', state: 'connected', spec: session.spec, endpoint: session.endpoint });
    this.onLine(session, JSON.stringify(hello));

    if (isServoFamily(session.spec))
      this.emit({ event: 'calibration', joints: calibrationMounts(session.calibration) });

    return { ok: true };
  }

  async pair(endpoint, address) {
    const pairing = this.pairRobot({ binary: this.binary, address, port: endpoint.port, code: endpoint.code });

    this.pendingPair = pairing;

    const key = await pairing.key;

    if (this.pendingPair !== pairing) throw new Error('The robot connection was canceled.');

    this.credentials.save(endpoint, key, address);
    this.pendingPair = null;
  }

  write(session, command) {
    if (command.cmd === 'recheck') this.transferArtefacts(session);

    super.write(session, command);
  }

  transferArtefacts(session) {
    const names = FILES.filter((name) => name !== 'policy.onnx' || this.policyTouched);

    session.pipe.transfer(names.map((name) => ({ name, file: path.join(session.artefacts, name) })));
  }

  policy(ask, requirePolicy = false) {
    const refs = checkedPolicyRefs(ask);

    if (!refs) return UNDOCUMENTED;

    if (this.currentPolicy(refs).bytes?.length > 16 * 1024 * 1024)
      return { ok: false, message: 'Choose a robot policy smaller than 16 MB.' };

    const touched = this.policyTouched;

    this.policyTouched = true;

    const reply = super.policy(ask, requirePolicy);

    if (!reply.ok) this.policyTouched = touched;

    return reply;
  }

  disconnect() {
    this.generation += 1;

    if (this.connecting && !this.session) this.emit({ event: 'link', state: 'closed' });

    this.pendingPair?.cancel();
    this.pendingPair = null;
    this.pending?.kill();
    this.pending = null;

    return super.disconnect();
  }

  calibrate(ask) {
    if (this.session && !this.session.calibration.joints.length) return UNDOCUMENTED;

    return super.calibrate(ask);
  }
}
