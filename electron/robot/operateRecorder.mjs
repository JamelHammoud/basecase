import { rungOf } from './ladder.mjs';

export const MIN_SECONDS = 2;
export const MOVED_RAD = 0.01;
export const MAX_INPUT_VALUES = 512;
export const POLICY_RUNG = 'rehearse';

const FLUSH_MS = 250;
const FLUSH_LINES = 200;
const PLACES = 1e4;
const MS = 1e3;
const SAFE_ID = /^[\w-]{1,128}$/;
const INPUT_ID = /^[a-z][\w-]{0,31}$/;
const HASH = /^[0-9a-f]{64}$/;

const rounded = (v, places) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * places) / places : null);

const fixed = (v) => rounded(v, PLACES);

const fixedAll = (values) => Array.from(values, fixed);

const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);

const isNumbers = (value, max) =>
  Array.isArray(value) && value.length <= max && value.every((v) => v === null || Number.isFinite(v));

export const newOperateId = () => `operate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function checkedContext(ask, joints) {
  if (!isPlain(ask) || !matches(SAFE_ID, ask.sceneId) || !isText(ask.robot, 512)) return null;

  if (!matches(HASH, ask.modelHash) || !Array.isArray(ask.joints) || ask.joints.length !== joints) return null;

  if (!ask.joints.every((j) => isText(j, 128))) return null;

  return { sceneId: ask.sceneId, robot: ask.robot, modelHash: ask.modelHash, joints: [...ask.joints] };
}

function checkedInput(input) {
  if (input === undefined) return undefined;

  const fits = isPlain(input) && matches(INPUT_ID, input.id) && isNumbers(input.values, MAX_INPUT_VALUES);

  return fits ? { id: input.id, values: fixedAll(input.values) } : null;
}

export function checkedSample(ask, joints) {
  if (!isPlain(ask) || Object.keys(ask).some((key) => key !== 'input' && key !== 'twin')) return null;

  const input = checkedInput(ask.input);
  const twin = ask.twin === undefined || isNumbers(ask.twin, joints) ? ask.twin : null;

  if (input === null || twin === null || (twin && twin.length !== joints)) return null;

  return { input, twin: twin && fixedAll(twin) };
}

function readings(event, ids, key) {
  const joints = Array.isArray(event.joints) ? event.joints : [];
  const values = ids.map((id) => fixed(joints.find((j) => j?.id === id)?.[key]));

  return values.some((v) => v !== null) ? values : null;
}

function moved(session) {
  return session.lo.some((lo, k) => session.hi[k] - lo > MOVED_RAD);
}

export class OperateRecorder {
  constructor({ spec, sink, radians, clock = () => Date.now(), newId = newOperateId, onClosed = () => {} }) {
    this.spec = spec;
    this.sink = sink;
    this.radians = radians;
    this.clock = clock;
    this.newId = newId;
    this.onClosed = onClosed;
    this.context = null;
    this.session = null;
    this.rung = 0;
    this.held = false;
    this.policyHash = null;
  }

  setContext(ask) {
    const context = checkedContext(ask, this.spec.ids.length);

    if (context) this.context = context;

    return !!context;
  }

  setPolicy(hash) {
    this.policyHash = matches(HASH, hash) ? hash : null;
  }

  event(event) {
    if (event.event === 'status') this.status(event);

    if (event.event === 'mode') this.mode(event.mode);

    if (event.event === 'fault') this.fault(event);
  }

  open() {
    const now = this.clock();

    this.session = {
      id: this.newId(),
      t0: now,
      startedAt: new Date(now).toISOString(),
      lines: [],
      flushedAt: now,
      frames: 0,
      last: 0,
      lo: this.spec.ids.map(() => Infinity),
      hi: this.spec.ids.map(() => -Infinity),
      top: this.rung,
      input: null,
      policy: null,
      lastIntent: '',
    };

    return this.session;
  }

  write(session, line) {
    const now = this.clock();

    session.last = (now - session.t0) / 1000;
    session.lines.push(JSON.stringify({ t: rounded(session.last, MS), ...line }));

    if (now - session.flushedAt >= FLUSH_MS || session.lines.length >= FLUSH_LINES) this.flush(session);
  }

  flush(session) {
    if (!session.lines.length) return;

    this.sink.append(session.id, `${session.lines.join('\n')}\n`);
    session.lines = [];
    session.flushedAt = this.clock();
  }

  noteRung(mode) {
    const rung = rungOf(mode);

    if (rung < 0) return;

    if (rung < this.rung && this.session) this.close('rung');

    this.rung = rung;

    if (this.session) this.session.top = Math.max(this.session.top, rung);

    if (this.session && this.policyHash && rung >= rungOf(POLICY_RUNG)) this.session.policy = this.policyHash;
  }

  status(event) {
    this.noteRung(event.mode);

    if (this.held) return;

    const session = this.session ?? this.open();
    const q = fixedAll(this.radians(event));

    q.forEach((v, k) => {
      if (v === null) return;

      session.lo[k] = Math.min(session.lo[k], v);
      session.hi[k] = Math.max(session.hi[k], v);
    });
    session.frames += 1;

    const velocity = readings(event, this.spec.ids, 'velocity');
    const effort = readings(event, this.spec.ids, 'effort');

    this.write(session, {
      k: 'status',
      mode: event.mode,
      run: event.run,
      q,
      ...(velocity ? { v: velocity } : {}),
      ...(effort ? { e: effort } : {}),
    });
  }

  mode(mode) {
    this.held = false;
    this.noteRung(mode);

    if (this.session) this.write(this.session, { k: 'mode', mode });
  }

  fault(event) {
    const session = this.session;

    this.held = true;

    if (!session) return;

    const id = typeof event.id === 'number' ? event.id : null;

    this.write(session, { k: 'fault', code: String(event.code ?? ''), id, message: String(event.message ?? '') });
    this.close('fault');
  }

  intent(joints) {
    const session = this.session;

    if (!session || this.held) return;

    const q = fixedAll(joints);
    const key = q.join();

    if (key === session.lastIntent) return;

    session.lastIntent = key;
    this.write(session, { k: 'intent', q });
  }

  sample(ask) {
    const sample = checkedSample(ask, this.spec.ids.length);

    if (!sample) return false;

    const session = this.session;

    if (!session || this.held) return true;

    if (sample.input) {
      session.input = sample.input.id;
      this.write(session, { k: 'input', id: sample.input.id, values: sample.input.values });
    }

    if (sample.twin) this.write(session, { k: 'twin', q: sample.twin });

    return true;
  }

  manifest(session, reason) {
    const { context } = this;
    const seconds = rounded(session.last, MS) ?? 0;

    return {
      version: 1,
      id: session.id,
      sceneId: context.sceneId,
      robot: { name: context.robot, modelHash: context.modelHash, joints: context.joints },
      case: null,
      source: 'operate',
      input: session.input ?? (session.policy ? 'policy' : null),
      startedAt: session.startedAt,
      seconds,
      rate: Math.max(1, Math.round(session.frames / Math.max(seconds, 1e-3))),
      frames: session.frames,
      outcome: { verdict: 'unjudged', margin: null },
      seed: 0,
      sourceTry: null,
      faults: [],
      family: this.spec.family,
      ended: reason,
      ...(session.policy ? { policy: session.policy } : {}),
    };
  }

  close(reason) {
    const session = this.session;

    if (!session) return;

    this.session = null;
    this.flush(session);

    const kept = !!this.context && session.last > MIN_SECONDS && moved(session);
    const manifest = kept ? this.manifest(session, reason) : null;

    if (manifest) this.sink.keep(manifest);
    else this.sink.drop(session.id);

    this.onClosed({ id: session.id, reason, manifest });
  }
}
