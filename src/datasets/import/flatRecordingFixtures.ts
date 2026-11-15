import { flatNested, flatTelemetry, telemetrySchema } from './decode/flatFixtures';
import { JOINT_STATE_SCHEMA, writeMcap, type FixtureMessage } from './mcapFixtures';
import { encodeJointState } from './ros2Cdr';

export const FLAT_START = 1_700_000_000;

export function flatMessages(): FixtureMessage[] {
  const schemaData = telemetrySchema();
  const messages: FixtureMessage[] = [0, 1, 2].map((i) => ({
    topic: '/telemetry',
    schema: 'robot.Telemetry',
    schemaEncoding: 'flatbuffer',
    encoding: 'flatbuffer',
    schemaData,
    logTime: BigInt(FLAT_START + i) * 1_000_000_000n,
    data: flatTelemetry(i, true),
  }));
  const { b, offset } = flatNested('another root');

  b.finish(offset);
  messages.push({
    topic: '/nested',
    schema: 'robot.Nested',
    schemaEncoding: 'flatbuffer',
    encoding: 'flatbuffer',
    schemaData,
    logTime: BigInt(FLAT_START) * 1_000_000_000n,
    data: b.asUint8Array().slice(),
  });

  return messages;
}

export function flatRecording(names = ['arm0', 'arm1', 'arm2']) {
  const joints: FixtureMessage[] = [0, 1, 2].map((i) => ({
    topic: '/joint_states',
    schema: JOINT_STATE_SCHEMA,
    logTime: BigInt(FLAT_START + i) * 1_000_000_000n,
    data: encodeJointState({ stamp: FLAT_START + i, name: names, position: names.map((_, j) => 0.1 * i * (j + 1)) }),
  }));
  const json: FixtureMessage = {
    topic: '/json',
    schema: 'robot.Json',
    schemaEncoding: 'jsonschema',
    encoding: 'json',
    logTime: BigInt(FLAT_START + 1) * 1_000_000_000n,
    schemaData: new Uint8Array(),
    data: new TextEncoder().encode('{"temperature":31.5}'),
  };

  return writeMcap([...flatMessages(), ...joints, json], { chunked: true, compression: 'zstd' });
}
