import { configuredStudioPublisher } from '../fleet/studioPublisher.mjs';
import { NetworkCredentials } from './networkCredentials.mjs';
import { discoverRobots } from './networkDiscovery.mjs';
import { NetworkRobotLink } from './networkRobotLink.mjs';
import { disconnectedState, NOT_CONNECTED, RobotLink, UNDOCUMENTED } from './robotLink.mjs';
import { checkedPolicyRefs } from './robotPolicy.mjs';
import { readRecordedRun } from './recordedRun.mjs';
import { DEFAULT_UNIT, MAX_UNITS, unitOf, versionOf } from './units.mjs';

const FLEET_FULL = { ok: false, message: `Disconnect a robot first: a fleet runs at most ${MAX_UNITS}.` };
const MAX_HISTORY = 32;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function unitSeed(unit) {
  if (unit === DEFAULT_UNIT) return null;

  let hash = FNV_OFFSET;

  for (const byte of Buffer.from(unit, 'utf8')) hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;

  return hash < 2 ? hash + 2 : hash;
}

const isEnded = (event) => event.event === 'link' && (event.state === 'closed' || event.state === 'lost');

const sceneWide = (unit) => unit === undefined || unit === null;

export class RobotFleet {
  constructor(options) {
    this.options = options;
    this.publisher = options.publisher ?? configuredStudioPublisher();
    this.emit = options.emit;
    this.credentials = new NetworkCredentials(options.networkStoreDir);
    this.candidates = [];
    this.fleet = new Map();
    this.recordings = new Map();
  }

  entryOf(unit) {
    const name = unitOf(unit);

    return name ? this.fleet.get(name) : undefined;
  }

  onEvent(unit, link, event) {
    const current = this.fleet.get(unit)?.link === link;

    if (current) void this.publisher?.publish({ ...event, unit }).catch(() => {});

    if (isEnded(event) && this.fleet.get(unit)?.link === link) {
      this.rememberRecording(unit, link.lastRecording);
      this.fleet.delete(unit);
    }

    this.emit({ ...event, unit });
  }

  rememberRecording(unit, recording) {
    this.recordings.delete(unit);
    this.recordings.set(unit, recording);

    if (this.recordings.size > MAX_UNITS) this.recordings.delete(this.recordings.keys().next().value);
  }

  connect(spec, unit) {
    const name = unitOf(unit);

    if (!name) return UNDOCUMENTED;

    const connected = this.fleet.get(name);

    if (connected) return connected.link.connect(spec);

    if (this.fleet.size >= MAX_UNITS) return FLEET_FULL;

    const link = new RobotLink({
      ...this.options,
      seed: unitSeed(name),
      emit: (event) => this.onEvent(name, link, event),
    });
    const entry = { link, pin: null, history: [] };

    link.policy(this.candidates);
    this.fleet.set(name, entry);

    const reply = link.connect(spec);

    if (!reply.ok) this.fleet.delete(name);
    else this.announcePolicy(name, entry);

    return reply;
  }

  discover() {
    return discoverRobots();
  }

  async connectNetwork(ask, unit) {
    const name = unitOf(unit);

    if (!name) return UNDOCUMENTED;

    if (this.fleet.has(name)) return { ok: false, message: 'A robot is connected. Disconnect it first.' };

    if (this.fleet.size >= MAX_UNITS) return FLEET_FULL;

    const link = new NetworkRobotLink({
      ...this.options,
      credentials: this.credentials,
      emit: (event) => this.onEvent(name, link, event),
    });
    const entry = { link, pin: null, history: [] };

    this.fleet.set(name, entry);

    const reply = await link.connect(ask);

    if (!reply.ok && this.fleet.get(name) === entry) this.fleet.delete(name);

    if (reply.ok && this.candidates.length) link.policy(this.candidates);

    if (reply.ok) this.announcePolicy(name, entry);

    return reply;
  }

  command(command, unit) {
    return this.withEntry(unit, (entry) => entry.link.command(command));
  }

  calibrate(joints, unit) {
    return this.withEntry(unit, (entry) => entry.link.calibrate(joints));
  }

  readRun(unit) {
    const name = unitOf(unit);

    if (!name) return null;

    return this.fleet.get(name)?.link.readRun() ?? readRecordedRun(this.options.tries, this.recordings.get(name));
  }

  record(sample, unit) {
    return this.withEntry(unit, (entry) => entry.link.record(sample));
  }

  withEntry(unit, call) {
    if (!unitOf(unit)) return UNDOCUMENTED;

    const entry = this.entryOf(unit);

    return entry ? call(entry) : NOT_CONNECTED;
  }

  disconnect(unit) {
    if (!unitOf(unit)) return UNDOCUMENTED;

    return this.entryOf(unit)?.link.disconnect() ?? { ok: true };
  }

  policy(refs, unit) {
    if (sceneWide(unit)) return this.sceneCandidates(refs);

    const checked = checkedPolicyRefs(refs);

    if (!checked || checked.length !== 1) return UNDOCUMENTED;

    return this.withEntry(unit, (entry) =>
      this.place(unitOf(unit), entry, checked[0], [...entry.history, entry.link.activePolicy].slice(-MAX_HISTORY)),
    );
  }

  sceneCandidates(refs) {
    const checked = checkedPolicyRefs(refs);

    if (!checked) return UNDOCUMENTED;

    this.candidates = checked;

    for (const [unit, entry] of this.fleet) this.followScene(unit, entry, checked);

    return { ok: true };
  }

  followScene(unit, entry, refs) {
    if (entry.pin) return;

    const reply = entry.link.policy(refs);

    if (reply.ok) this.announcePolicy(unit, entry);
  }

  rollBack(unit) {
    return this.withEntry(unit, (entry) => {
      if (entry.history.length === 0) return UNDOCUMENTED;

      const pin = entry.history.at(-1);

      return this.place(unitOf(unit), entry, pin, entry.history.slice(0, -1));
    });
  }

  place(unit, entry, pin, history) {
    const reply = entry.link.policy(pin ? [pin] : [], Boolean(pin));

    if (!reply.ok) return reply;

    entry.pin = pin;
    entry.history = history;
    this.announcePolicy(unit, entry);

    return { ok: true };
  }

  announcePolicy(unit, entry) {
    this.emit({
      event: 'policy',
      unit,
      version: versionOf(entry.link.activePolicy),
      previous: versionOf(entry.history.at(-1) ?? null),
      hasPrevious: entry.history.length > 0,
    });
  }

  state(unit) {
    const name = unitOf(unit);

    if (!name) return UNDOCUMENTED;

    const entry = this.fleet.get(name);

    if (!entry) return { ...disconnectedState(), unit: name, version: null, previous: null, hasPrevious: false };

    return {
      ...entry.link.state(),
      unit: name,
      version: versionOf(entry.link.activePolicy),
      previous: versionOf(entry.history.at(-1) ?? null),
      hasPrevious: entry.history.length > 0,
    };
  }

  units() {
    return [...this.fleet.keys()].sort().map((name) => this.state(name));
  }

  dispose() {
    const pending = [...this.fleet.keys()].map((unit) =>
      this.publisher?.publish({ unit, event: 'link', state: 'closed' }),
    );

    for (const entry of this.fleet.values()) entry.link.dispose();

    void Promise.allSettled(pending).finally(() => this.publisher?.dispose());
  }
}
