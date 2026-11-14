import { LADDER } from './ladder.mjs';
import { rounded, RobotTake, TAKE_VERSION } from './robotTake.mjs';

export const MAX_TAKE_SECONDS = 3600;

const POLICY_FROM = LADDER.indexOf('rehearse');

export const newTakeId = () => `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const roundedList = (values) => (Array.isArray(values) ? values.map(rounded) : null);

export function jointValues(status, ids, key) {
  const joints = Array.isArray(status?.joints) ? status.joints : [];
  const values = ids.map((id) => {
    const v = joints.find((j) => j?.id === id)?.[key];

    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });

  return values.some((v) => v !== null) ? values : null;
}

export class TakeTap {
  constructor({ sink, emit, now, joints, positionsOf, ids, newId = newTakeId }) {
    this.sink = sink;
    this.emit = emit;
    this.now = now;
    this.joints = joints;
    this.positionsOf = positionsOf;
    this.ids = ids;
    this.newId = newId;
    this.take = null;
    this.rank = 0;
    this.policyHash = null;
    this.context = null;
  }

  setContext(context) {
    this.context = context;

    if (this.take) this.add(['c', context]);
  }

  setPolicy(hash) {
    this.policyHash = hash;
    this.notePolicy();
  }

  event(event) {
    if (event.event === 'link' && event.state !== 'connected') return this.close(null);

    if (event.event === 'fault') return this.close(typeof event.message === 'string' ? event.message : 'fault');

    if (event.event === 'mode') return this.onMode(event.mode);

    if (event.event === 'status') this.onStatus(event);
  }

  onMode(mode) {
    const rank = LADDER.indexOf(mode);

    if (rank < 0) return;

    if (this.take && rank < this.rank) this.close(null);

    this.rank = rank;
    this.notePolicy();
  }

  onStatus(status) {
    this.onMode(status.mode);

    if (this.take && this.take.seconds >= MAX_TAKE_SECONDS) this.close(null);

    if (!this.take) this.open();

    const position = this.positionsOf(status).map(rounded);
    const velocity = roundedList(jointValues(status, this.ids, 'velocity'));
    const effort = roundedList(jointValues(status, this.ids, 'effort'));

    this.add(['s', this.at(), position, velocity, effort]);
  }

  intent(joints) {
    if (this.take) this.add(['i', this.at(), roundedList(joints)]);
  }

  sample({ twin, input }) {
    if (!this.take) return;

    if (twin) this.add(['w', this.at(), roundedList(twin)]);

    if (input) this.add(['x', this.at(), input.id, roundedList(input.values)]);
  }

  notePolicy() {
    if (!this.take || this.rank < POLICY_FROM || !this.policyHash || this.take.policy === this.policyHash) return;

    this.add(['p', this.policyHash]);
  }

  at() {
    return Math.round(this.now() - this.openedAt) / 1000;
  }

  add(row) {
    this.take.apply(row);
    this.sink.append(this.take.id, row);
  }

  open() {
    const id = this.newId();
    const joints = this.joints();
    const startedAt = new Date().toISOString();

    this.take = new RobotTake({ id, joints, startedAt });
    this.openedAt = this.now();
    this.sink.open(id, { take: TAKE_VERSION, id, joints, startedAt });

    if (this.context) this.add(['c', this.context]);

    this.notePolicy();
    this.emit({ event: 'take', state: 'open', id });
  }

  close(fault) {
    const take = this.take;

    if (!take) return;

    this.take = null;

    if (fault) take.apply(['f', fault]);

    const kept = take.keeps(!!fault);
    const tell = (saved) =>
      this.emit({
        event: 'take',
        state: saved ? 'kept' : 'dropped',
        id: take.id,
        ...(fault ? { fault: true, replayable: saved && take.replayable() } : {}),
      });

    try {
      const done = this.sink.finish({ id: take.id, kept, take });

      Promise.resolve(done).then(
        () => tell(kept),
        () => tell(false),
      );
    } catch {
      tell(false);
    }
  }
}
