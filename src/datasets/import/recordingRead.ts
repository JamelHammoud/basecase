import { plural } from '../../../electron/plural.mjs';
import { TopicCollector } from '../../topics/collector';
import { IMAGE_SCHEMAS, isSchema, JOINT_SCHEMAS } from '../../topics/schemas';
import type { Decoded, DecodedMessage, TopicLog } from '../../topics/topicLog';
import type { MessageDecoder } from './decode';
import { MCAP_DAMAGED, MCAP_TOO_MANY_JOINTS } from './ros2Cdr';
import { DataImportError, finiteOrRefuse, IMPORT_LIMITS } from './types';

export const RECORDING_EMPTY = 'This recording has no messages.';
export const RECORDING_TOO_LONG = `This recording is longer than ${plural(IMPORT_LIMITS.seconds / 60, 'minute')}.`;

const NS_PER_SECOND = 1_000_000_000n;
const MAX_SPAN_NS = BigInt(IMPORT_LIMITS.seconds) * NS_PER_SECOND;
const HEADER_CLOCK_NS = 60n * NS_PER_SECOND;

export interface JointSample {
  ns: bigint;
  names: string[];
  position: Float64Array;
}

export interface ImageTopic {
  path: string;
  first: bigint;
  last: bigint;
  frames: number;
}

export interface RecordingChannel {
  topic: string;
  schema: string;
  decode: MessageDecoder;
  clock: 'header' | 'log' | null;
}

export interface RecordedMessage {
  path: string;
  logTime: bigint;
  data: Uint8Array;
}

export interface Read {
  joints: JointSample[];
  images: Map<string, ImageTopic>;
  first: bigint;
  last: bigint;
  topics: TopicLog;
}

const damaged = () => new DataImportError(MCAP_DAMAGED);

const isMessage = (value: Decoded | undefined): value is DecodedMessage =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

const isWhole = (value: Decoded | undefined, below = Infinity): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;

export function stampNs(message: DecodedMessage): bigint | null {
  const header = message.header;
  const stamp = isMessage(header) ? header.stamp : message.stamp;

  if (!isMessage(stamp)) return null;

  const nano = stamp.nanosec ?? stamp.nsec;

  if (!isWhole(stamp.sec) || !isWhole(nano, 1e9)) return null;

  const ns = BigInt(stamp.sec) * NS_PER_SECOND + BigInt(nano);

  return ns === 0n ? null : ns;
}

function jointSample(message: DecodedMessage, ns: bigint): JointSample | null {
  const { name, position } = message;
  const values = Array.isArray(position) ? null : position;

  if (!(values instanceof Float64Array) || values.length === 0) return null;

  if (!Array.isArray(name) || !name.every((n) => typeof n === 'string')) throw damaged();

  if (name.length > IMPORT_LIMITS.joints) throw new DataImportError(MCAP_TOO_MANY_JOINTS);

  if (values.length !== name.length) throw damaged();

  finiteOrRefuse(values, 'This recording');

  return { ns, names: name as string[], position: values };
}

const gap = (a: bigint, b: bigint) => (a > b ? a - b : b - a);

export class RecordingReader {
  readonly #topics = new TopicCollector();
  readonly #joints: JointSample[] = [];
  readonly #images = new Map<string, ImageTopic>();
  #first: bigint | null = null;
  #last: bigint | null = null;

  channel(topic: string, schema: string, decode: MessageDecoder): RecordingChannel {
    return { topic, schema, decode, clock: null };
  }

  #time(channel: RecordingChannel, stamp: bigint | null, logTime: bigint) {
    if (stamp === null) return logTime;

    channel.clock ??= gap(stamp, logTime) <= HEADER_CLOCK_NS ? 'header' : 'log';

    return channel.clock === 'header' ? stamp : logTime;
  }

  #note(ns: bigint) {
    const first = this.#first === null || ns < this.#first ? ns : this.#first;
    const last = this.#last === null || ns > this.#last ? ns : this.#last;

    if (last - first > MAX_SPAN_NS) throw new DataImportError(RECORDING_TOO_LONG);

    this.#first = first;
    this.#last = last;
  }

  #image(topic: string, path: string, ns: bigint) {
    const seen = this.#images.get(topic);

    if (!seen) {
      this.#images.set(topic, { path, first: ns, last: ns, frames: 1 });

      return;
    }

    seen.first = ns < seen.first ? ns : seen.first;
    seen.last = ns > seen.last ? ns : seen.last;
    seen.frames += 1;
  }

  message(channel: RecordingChannel, { path, logTime, data }: RecordedMessage) {
    const decoded = channel.decode(data);
    const ns = this.#time(channel, stampNs(decoded), logTime);
    const joints = isSchema(JOINT_SCHEMAS, channel.schema) ? jointSample(decoded, ns) : null;

    this.#note(ns);

    if (joints) this.#joints.push(joints);

    if (isSchema(IMAGE_SCHEMAS, channel.schema)) this.#image(channel.topic, path, ns);

    this.#topics.add(channel.topic, channel.schema, ns, decoded);
  }

  finish(): Read {
    if (this.#first === null || this.#last === null) throw new DataImportError(RECORDING_EMPTY);

    return {
      joints: this.#joints,
      images: this.#images,
      first: this.#first,
      last: this.#last,
      topics: this.#topics.finish(this.#first),
    };
  }
}
