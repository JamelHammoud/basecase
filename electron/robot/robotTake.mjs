import { packArrays, unpackArrays } from '../library/arrayFile.mjs';

export const TAKE_VERSION = 1;
export const KEEP_SECONDS = 2;
export const MOVED_RAD = 0.02;
export const BY_HAND = 'by-hand';
export const MAX_INPUT_VALUES = 512;
export const DEFAULT_SCENE = 'operate';
export const REPLAY_SECONDS = 20;

export const TAKE_ARRAYS = {
  t: 'f64',
  position: 'f32',
  velocity: 'f32',
  effort: 'f32',
  intentT: 'f64',
  intent: 'f32',
  twinT: 'f64',
  twin: 'f32',
  inputT: 'f64',
  inputId: 'i32',
  inputLength: 'i32',
  input: 'f32',
};

const PLACES = 1e5;

export const rounded = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * PLACES) / PLACES : null);

const numberAt = (values, k) => {
  const v = values?.[k];

  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
};

const numbers = (values, n) => Array.from({ length: n }, (_, k) => numberAt(values, k));

class Column {
  constructor(make, start = 256) {
    this.make = make;
    this.data = make(start);
    this.used = 0;
  }

  push(values) {
    if (this.used + values.length > this.data.length) {
      const next = this.make(Math.max(this.data.length * 2, this.used + values.length));

      next.set(this.data);
      this.data = next;
    }

    this.data.set(values, this.used);
    this.used += values.length;
  }

  done() {
    return this.data.slice(0, this.used);
  }
}

const f32 = (n) => new Float32Array(n);
const f64 = (n) => new Float64Array(n);
const i32 = (n) => new Int32Array(n);

function backfilled(before) {
  const column = new Column(f32, Math.max(256, before));

  column.push(new Float32Array(before).fill(NaN));

  return column;
}

export class RobotTake {
  constructor({ id, joints, startedAt }) {
    this.id = id;
    this.joints = [...joints];
    this.n = joints.length;
    this.startedAt = startedAt;
    this.t = new Column(f64);
    this.position = new Column(f32);
    this.velocity = null;
    this.effort = null;
    this.intentT = new Column(f64);
    this.intent = new Column(f32);
    this.twinT = new Column(f64);
    this.twin = new Column(f32);
    this.inputT = new Column(f64);
    this.inputId = new Column(i32);
    this.inputLength = new Column(i32);
    this.input = new Column(f32);
    this.inputIds = [];
    this.lastInput = null;
    this.low = new Float64Array(this.n).fill(Infinity);
    this.high = new Float64Array(this.n).fill(-Infinity);
    this.policy = null;
    this.fault = null;
    this.context = null;
  }

  get frames() {
    return this.t.used;
  }

  get intents() {
    return this.intentT.used;
  }

  get seconds() {
    return this.frames < 2 ? 0 : this.t.data[this.frames - 1] - this.t.data[0];
  }

  get moved() {
    return this.high.some((h, k) => h - this.low[k] > MOVED_RAD);
  }

  apply(row) {
    const [kind] = row;

    if (kind === 's') this.status(row);
    else if (kind === 'i') this.addIntent(row);
    else if (kind === 'w') this.addTwin(row);
    else if (kind === 'x') this.addInput(row);
    else this.note(row);
  }

  note([kind, value]) {
    if (kind === 'p') this.policy = typeof value === 'string' ? value : null;

    if (kind === 'f') this.fault = typeof value === 'string' ? value : null;

    if (kind === 'c' && value && typeof value === 'object') this.named(value);
  }

  named(context) {
    this.context = context;

    if (Array.isArray(context.joints) && context.joints.length === this.n) this.joints = context.joints.map(String);
  }

  status([, t, position, velocity, effort]) {
    const before = this.frames * this.n;
    const values = numbers(position, this.n);

    this.t.push([t]);
    this.position.push(values);
    values.forEach((v, k) => {
      if (Number.isNaN(v)) return;

      this.low[k] = Math.min(this.low[k], v);
      this.high[k] = Math.max(this.high[k], v);
    });
    this.velocity = this.lane(this.velocity, velocity, before);
    this.effort = this.lane(this.effort, effort, before);
  }

  lane(column, values, before) {
    if (!column && !values) return null;

    const out = column ?? backfilled(before);

    out.push(numbers(values, this.n));

    return out;
  }

  addIntent([, t, joints]) {
    this.intentT.push([t]);
    this.intent.push(numbers(joints, this.n));
  }

  addTwin([, t, twin]) {
    this.twinT.push([t]);
    this.twin.push(numbers(twin, this.n));
  }

  addInput([, t, id, values]) {
    const list = Array.isArray(values) ? values.slice(0, MAX_INPUT_VALUES) : [];
    let index = this.inputIds.indexOf(id);

    if (index < 0) index = this.inputIds.push(id) - 1;

    this.lastInput = id;
    this.inputT.push([t]);
    this.inputId.push([index]);
    this.inputLength.push([list.length]);
    this.input.push(numbers(list, list.length));
  }

  replayable() {
    if (!this.frames) return false;

    const from = this.t.data[this.frames - 1] - REPLAY_SECONDS;
    let first = 0;

    while (this.t.data[first] < from) first++;

    const start = this.t.data[first];

    return this.intentT.done().some((t) => t >= start);
  }

  keeps(faulted) {
    if (!this.frames) return false;

    return (this.seconds > KEEP_SECONDS && this.moved) || (faulted && this.intents > 0);
  }

  inputName() {
    if (this.lastInput) return this.lastInput;

    if (this.policy) return 'policy';

    return this.intents ? 'sim' : BY_HAND;
  }

  manifest() {
    const context = this.context ?? {};
    const seconds = Math.round(this.seconds * 1000) / 1000;

    return {
      version: TAKE_VERSION,
      id: this.id,
      sceneId: context.sceneId ?? DEFAULT_SCENE,
      robot: { name: context.robot ?? '', modelHash: '', joints: this.joints },
      case: null,
      source: 'operate',
      input: this.inputName(),
      startedAt: this.startedAt,
      seconds,
      rate: seconds > 0 ? Math.max(1, Math.round((this.frames - 1) / seconds)) : 1,
      frames: this.frames,
      outcome: { verdict: 'unjudged', margin: null },
      seed: 0,
      sourceTry: null,
      faults: [],
      ...(this.policy ? { policy: this.policy } : {}),
      ...(this.fault ? { fault: this.fault } : {}),
    };
  }

  bytes() {
    const lanes = [
      ['t', this.t],
      ['position', this.position],
      ['velocity', this.velocity],
      ['effort', this.effort],
      ['intentT', this.intentT],
      ['intent', this.intent],
      ['twinT', this.twinT],
      ['twin', this.twin],
      ['inputT', this.inputT],
      ['inputId', this.inputId],
      ['inputLength', this.inputLength],
      ['input', this.input],
    ];
    const header = { kind: 'take', version: TAKE_VERSION, joints: this.joints, inputIds: this.inputIds };

    return packArrays(
      header,
      lanes.flatMap(([key, column]) => (column ? [[key, column.done()]] : [])),
    );
  }
}

export function takeOfLog(lines) {
  const [first, ...rest] = lines;

  if (!first || first.take !== TAKE_VERSION || typeof first.id !== 'string' || !Array.isArray(first.joints))
    return null;

  const take = new RobotTake({ id: first.id, joints: first.joints.map(String), startedAt: String(first.startedAt) });

  for (const row of rest) if (Array.isArray(row) && typeof row[0] === 'string') take.apply(row);

  return take;
}

const isNames = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

function lengthsFit(header, a) {
  const n = header.joints.length;
  const frames = a.t?.length ?? -1;
  const pairs = [
    [a.position, frames * n],
    [a.velocity, frames * n],
    [a.effort, frames * n],
    [a.intent, (a.intentT?.length ?? 0) * n],
    [a.twin, (a.twinT?.length ?? 0) * n],
    [a.inputId, a.inputT?.length ?? 0],
    [a.inputLength, a.inputT?.length ?? 0],
  ];

  return frames >= 0 && !!a.position && pairs.every(([arr, want]) => !arr || arr.length === want);
}

function inputsFit(header, a) {
  const lengths = a.inputLength ?? new Int32Array(0);
  const total = lengths.reduce((sum, l) => sum + Math.max(0, l), 0);
  const known = (a.inputId ?? []).every((k) => k >= 0 && k < header.inputIds.length);

  return known && (a.input?.length ?? 0) === total && lengths.every((l) => l >= 0);
}

const EMPTY = () => ({
  velocity: null,
  effort: null,
  intentT: new Float64Array(0),
  intent: new Float32Array(0),
  twinT: new Float64Array(0),
  twin: new Float32Array(0),
  inputT: new Float64Array(0),
  inputId: new Int32Array(0),
  inputLength: new Int32Array(0),
  input: new Float32Array(0),
});

export function decodeTake(bytes) {
  const unpacked = unpackArrays(bytes, TAKE_ARRAYS);
  const header = unpacked?.header;

  if (!header || header.kind !== 'take' || !isNames(header.joints) || !isNames(header.inputIds)) return null;

  const a = unpacked.arrays;

  if (!lengthsFit(header, a) || !inputsFit(header, a)) return null;

  return { ...EMPTY(), ...a, joints: header.joints, inputIds: header.inputIds, frames: a.t.length };
}
